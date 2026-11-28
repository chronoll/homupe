import { getContents } from "@/lib/notion";
import { getContentWeekStart } from "@/lib/contentDates";
import { enrichContentEntries } from "@/lib/contentEntries";
import type { ContentEntry } from "@/lib/notion";
import { PageLayout, ContentFrame } from "@/components/PageLayout";
import ContentsView from "@/components/ContentsView";

export const revalidate = 3600;

const WEEKS_PER_PAGE = 4;

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
    const key = getContentWeekStart(entry.date);
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

  const contents = await enrichContentEntries(entriesToEnrich);

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
