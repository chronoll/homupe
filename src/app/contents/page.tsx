import { getContents } from "@/lib/notion";
import { fetchContentMetadata } from "@/lib/metadata";
import type { ContentEntry } from "@/lib/notion";
import { PageLayout, ContentFrame } from "@/components/PageLayout";
import ContentsView from "@/components/ContentsView";

export const revalidate = 3600;

const WEEKS_PER_PAGE = 4;

function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return d.toISOString().split("T")[0];
}

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

export default async function ContentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const requestedPage = Math.max(1, parseInt(params.page || "1", 10) || 1);

  const rawContents = await getContents();
  const isFirstPage = requestedPage === 1;

  const rawPickups = isFirstPage ? rawContents.filter((e) => e.pickup) : [];
  const rawOthers = rawContents.filter((e) => !e.pickup);

  const grouped = new Map<string, ContentEntry[]>();
  for (const entry of rawOthers) {
    const key = entry.date ? getWeekStart(entry.date) : "undated";
    const list = grouped.get(key) || [];
    list.push(entry);
    grouped.set(key, list);
  }
  const allWeeks = [...grouped.keys()].sort((a, b) => {
    if (a === "undated") return 1;
    if (b === "undated") return -1;
    return b.localeCompare(a);
  });
  const totalPages = Math.max(1, Math.ceil(allWeeks.length / WEEKS_PER_PAGE));
  const currentPage = Math.min(requestedPage, totalPages);
  const sliceStart = (currentPage - 1) * WEEKS_PER_PAGE;
  const pageWeeks = allWeeks.slice(sliceStart, sliceStart + WEEKS_PER_PAGE);

  const entriesToEnrich: ContentEntry[] = [...rawPickups];
  for (const week of pageWeeks) {
    entriesToEnrich.push(...(grouped.get(week) || []));
  }

  const contents: ContentEntry[] = [];
  for (let i = 0; i < entriesToEnrich.length; i += 5) {
    const batch = await Promise.all(
      entriesToEnrich.slice(i, i + 5).map(enrichEntry)
    );
    contents.push(...batch);
  }

  return (
    <PageLayout title="コンテンツ" maxWidth={9999} className="contents-page-root" innerClassName="contents-page-inner">
      <div className="contents-page-wrapper" style={{ margin: "0 clamp(8px, 4vw, 44px)" }}>
        <ContentFrame className="contents-frame">
          <ContentsView
            entries={contents}
            currentPage={currentPage}
            totalPages={totalPages}
          />
        </ContentFrame>
      </div>
    </PageLayout>
  );
}
