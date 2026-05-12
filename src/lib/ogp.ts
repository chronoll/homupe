import type { BlockWithChildren } from '@/lib/notion';

export interface OgpMetadata {
  type: 'ogp';
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  url: string;
}

export interface GitHubPermalinkMetadata {
  type: 'github-permalink';
  owner: string;
  repo: string;
  ref: string;
  path: string;
  startLine: number;
  endLine: number;
  code: string;
  language: string;
  url: string;
}

export type LinkMetadata = OgpMetadata | GitHubPermalinkMetadata;

const GITHUB_PERMALINK_RE =
  /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+?)#L(\d+)(?:-L(\d+))?$/;

const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
  mjs: 'javascript', cjs: 'javascript',
  go: 'go', py: 'python', rb: 'ruby', java: 'java', kt: 'kotlin',
  rs: 'rust', cpp: 'cpp', cc: 'cpp', c: 'c', h: 'c', hpp: 'cpp',
  cs: 'csharp', php: 'php', swift: 'swift', sh: 'bash', zsh: 'bash',
  md: 'markdown', json: 'json', yaml: 'yaml', yml: 'yaml',
  toml: 'toml', xml: 'xml', html: 'html', css: 'css', scss: 'scss',
  sql: 'sql', dockerfile: 'dockerfile',
};

function detectLanguageFromPath(path: string): string {
  const filename = path.split('/').pop() || '';
  if (filename.toLowerCase() === 'dockerfile') return 'dockerfile';
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return EXT_TO_LANG[ext] || 'text';
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 5000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchGitHubPermalink(url: string): Promise<GitHubPermalinkMetadata | null> {
  const m = url.match(GITHUB_PERMALINK_RE);
  if (!m) return null;
  const [, owner, repo, ref, path, startStr, endStr] = m;
  const startLine = Number(startStr);
  const endLine = endStr ? Number(endStr) : startLine;
  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`;
  try {
    const res = await fetchWithTimeout(rawUrl, { next: { revalidate: 86400 } } as RequestInit);
    if (!res.ok) return null;
    const text = await res.text();
    const lines = text.split('\n');
    const slice = lines.slice(startLine - 1, endLine).join('\n');
    return {
      type: 'github-permalink',
      owner,
      repo,
      ref,
      path,
      startLine,
      endLine,
      code: slice,
      language: detectLanguageFromPath(path),
      url,
    };
  } catch {
    return null;
  }
}

function extractMeta(html: string, prop: string): string | null {
  const safe = prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re1 = new RegExp(
    `<meta[^>]+(?:property|name)=["']${safe}["'][^>]+content=["']([^"']+)["']`,
    'i',
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${safe}["']`,
    'i',
  );
  return html.match(re1)?.[1] ?? html.match(re2)?.[1] ?? null;
}

function extractTitle(html: string): string | null {
  return html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? null;
}

async function fetchOgp(url: string): Promise<OgpMetadata | null> {
  try {
    const res = await fetchWithTimeout(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HomupeBot/1.0)' },
      next: { revalidate: 86400 },
    } as RequestInit);
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/html')) return null;
    const html = (await res.text()).slice(0, 200_000); // 過剰なHTMLを切る
    return {
      type: 'ogp',
      title: extractMeta(html, 'og:title') ?? extractMeta(html, 'twitter:title') ?? extractTitle(html),
      description:
        extractMeta(html, 'og:description') ??
        extractMeta(html, 'twitter:description') ??
        extractMeta(html, 'description'),
      image: extractMeta(html, 'og:image') ?? extractMeta(html, 'twitter:image'),
      siteName: extractMeta(html, 'og:site_name'),
      url: extractMeta(html, 'og:url') ?? url,
    };
  } catch {
    return null;
  }
}

export async function fetchLinkMetadata(url: string): Promise<LinkMetadata | null> {
  if (GITHUB_PERMALINK_RE.test(url)) {
    const gh = await fetchGitHubPermalink(url);
    if (gh) return gh;
  }
  return fetchOgp(url);
}

/**
 * ブロックツリーを走査して link_preview / bookmark のURLを集め、
 * 並列で metadata を取得して各ブロックに `metadata` フィールドとして注入する。
 */
export async function enrichLinkBlocks(blocks: BlockWithChildren[]): Promise<void> {
  const targets: { block: BlockWithChildren; url: string; key: 'link_preview' | 'bookmark' }[] = [];

  const collect = (bs: BlockWithChildren[]) => {
    for (const b of bs) {
      if (b.type === 'link_preview' && b.link_preview?.url) {
        targets.push({ block: b, url: b.link_preview.url, key: 'link_preview' });
      } else if (b.type === 'bookmark' && b.bookmark?.url) {
        targets.push({ block: b, url: b.bookmark.url, key: 'bookmark' });
      }
      if (b.children?.length) collect(b.children);
    }
  };
  collect(blocks);

  await Promise.all(
    targets.map(async ({ block, url, key }) => {
      const meta = await fetchLinkMetadata(url);
      if (meta) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (block as any)[key].metadata = meta;
      }
    }),
  );
}
