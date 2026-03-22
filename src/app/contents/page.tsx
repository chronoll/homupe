import { getContents } from "@/lib/notion";
import { fetchContentMetadata } from "@/lib/metadata";
import type { ContentEntry } from "@/lib/notion";
import { PageLayout, ContentFrame } from "@/components/PageLayout";
import ContentsView from "@/components/ContentsView";

export const revalidate = 3600;

// YouTubeのURL各パターンからvideo IDを抽出
function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]+)/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]+)/,
    /(?:youtube\.com\/live\/)([a-zA-Z0-9_-]+)/,
    /(?:music\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function isUrl(s: string): boolean {
  return /^https?:\/\//.test(s);
}

async function enrichEntry(entry: ContentEntry): Promise<ContentEntry> {
  let { title, url, imageUrl } = entry;

  if (!url && title && isUrl(title)) {
    url = title;
  }

  if (!url) return entry;

  const needsTitle = !title || isUrl(title);
  const needsImage = !imageUrl;

  if (!needsTitle && !needsImage) return { ...entry, url } as ContentEntry;

  if (needsImage) {
    const ytId = extractYouTubeId(url);
    if (ytId) {
      imageUrl = `https://i.ytimg.com/vi/${ytId}/mqdefault.jpg`;
      if (!needsTitle) return { ...entry, url, imageUrl };
    }
  }

  if (needsTitle || !imageUrl) {
    try {
      const meta = await fetchContentMetadata(url);
      if (meta) {
        if (needsTitle && meta.title) title = meta.title;
        if (!imageUrl && meta.thumbnailUrl) imageUrl = meta.thumbnailUrl;
      }
    } catch {
      // ignore
    }
  }

  return { ...entry, title: title || url, url, imageUrl };
}

export default async function ContentsPage() {
  const rawContents = await getContents();

  const contents: ContentEntry[] = [];
  for (let i = 0; i < rawContents.length; i += 5) {
    const batch = await Promise.all(
      rawContents.slice(i, i + 5).map(enrichEntry)
    );
    contents.push(...batch);
  }

  return (
    <PageLayout title="コンテンツ" maxWidth={9999}>
      <div style={{ margin: "0 44px" }}>
        <ContentFrame>
          <ContentsView entries={contents} />
        </ContentFrame>
      </div>
    </PageLayout>
  );
}
