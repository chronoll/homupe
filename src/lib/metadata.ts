export interface ContentItem {
  url: string;
  title: string;
  description: string;
  thumbnailUrl: string;
}

interface OEmbedResponse {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
}

// oEmbed endpoints for supported services
const OEMBED_ENDPOINTS: Record<string, string> = {
  "youtube.com": "https://www.youtube.com/oembed?format=json&url=",
  "youtu.be": "https://www.youtube.com/oembed?format=json&url=",
  "music.youtube.com": "https://www.youtube.com/oembed?format=json&url=",
  "open.spotify.com": "https://open.spotify.com/oembed?url=",
  "soundcloud.com": "https://soundcloud.com/oembed?format=json&url=",
};

// Sites that require bot UA for OGP (SPA that renders OGP only for crawlers)
const BOT_UA_HOSTS = new Set(["tver.jp"]);

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const BOT_UA = "facebookexternalhit/1.1";

function getHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

const FETCH_TIMEOUT = 8000;

async function fetchWithTimeout(
  input: string,
  init?: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchViaOEmbed(
  oembedEndpoint: string,
  url: string
): Promise<ContentItem | null> {
  try {
    const res = await fetchWithTimeout(oembedEndpoint + encodeURIComponent(url));
    if (!res.ok) return null;
    const data: OEmbedResponse = await res.json();
    return {
      url,
      title: data.title || "",
      description: data.author_name || "",
      thumbnailUrl: data.thumbnail_url || "",
    };
  } catch {
    return null;
  }
}

function extractOgTag(html: string, property: string): string {
  // Match both property="og:xxx" content="..." and content="..." property="og:xxx"
  const patterns = [
    new RegExp(
      `<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`,
      "i"
    ),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[1];
  }
  return "";
}

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? match[1].trim() : "";
}

async function fetchViaOgp(url: string): Promise<ContentItem | null> {
  const host = getHost(url);
  const ua = BOT_UA_HOSTS.has(host) ? BOT_UA : BROWSER_UA;

  try {
    const res = await fetchWithTimeout(url, {
      headers: { "User-Agent": ua },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const html = await res.text();

    const ogTitle = extractOgTag(html, "og:title");
    const ogImage = extractOgTag(html, "og:image");
    const ogDescription = extractOgTag(html, "og:description");
    const title = ogTitle || extractTitle(html);

    if (!title && !ogImage) return null;

    return {
      url,
      title: title || "",
      description: ogDescription || "",
      thumbnailUrl: ogImage || "",
    };
  } catch {
    return null;
  }
}

export async function fetchContentMetadata(
  url: string
): Promise<ContentItem | null> {
  const host = getHost(url);

  // Check oEmbed first
  for (const [domain, endpoint] of Object.entries(OEMBED_ENDPOINTS)) {
    if (host.includes(domain)) {
      return fetchViaOEmbed(endpoint, url);
    }
  }

  // Fallback to OGP scraping
  return fetchViaOgp(url);
}

export async function fetchMultipleContent(
  urls: string[]
): Promise<ContentItem[]> {
  const results = await Promise.allSettled(urls.map(fetchContentMetadata));
  return results
    .filter(
      (r): r is PromiseFulfilledResult<ContentItem> =>
        r.status === "fulfilled" && r.value !== null
    )
    .map((r) => r.value);
}
