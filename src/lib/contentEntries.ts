import { fetchContentMetadata } from "@/lib/metadata";
import type { ContentEntry } from "@/lib/notion";

export const CONTENT_ENRICHMENT_TIMEOUT_MS = 8000;
const ENRICHMENT_BATCH_SIZE = 5;

type MetadataFetcher = typeof fetchContentMetadata;

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

function isUrl(value: string): boolean {
  return /^https?:\/\//.test(value);
}

export async function enrichContentEntry(
  entry: ContentEntry,
  fetchMetadata: MetadataFetcher = fetchContentMetadata
): Promise<ContentEntry> {
  const title = entry.title;
  let { url, imageUrl } = entry;

  if (!url && title && isUrl(title)) url = title;
  if (!url) return entry;

  const needsTitle = !title || isUrl(title);
  const needsImage = !imageUrl;
  if (!needsTitle && !needsImage) return { ...entry, url };

  if (needsImage) {
    const youtubeId = extractYouTubeId(url);
    if (youtubeId) {
      imageUrl = `https://i.ytimg.com/vi/${youtubeId}/mqdefault.jpg`;
      if (!needsTitle) return { ...entry, url, imageUrl };
    }
  }

  let enrichedTitle = title;
  if (needsTitle || !imageUrl) {
    try {
      const metadata = await fetchMetadata(url);
      if (metadata) {
        if (needsTitle && metadata.title) enrichedTitle = metadata.title;
        if (!imageUrl && metadata.thumbnailUrl) imageUrl = metadata.thumbnailUrl;
      }
    } catch {
      // A metadata failure must not prevent the contents page from rendering.
    }
  }

  return { ...entry, title: enrichedTitle || url, url, imageUrl };
}

async function enrichInBatches(
  entries: ContentEntry[],
  fetchMetadata: MetadataFetcher,
  isExpired: () => boolean
): Promise<ContentEntry[]> {
  const result: ContentEntry[] = [];
  for (let index = 0; index < entries.length; index += ENRICHMENT_BATCH_SIZE) {
    // The timeout can win while an in-flight batch is settling. Do not start any
    // more external work after the page-wide deadline has elapsed.
    if (isExpired()) return entries;

    const batch = await Promise.all(
      entries
        .slice(index, index + ENRICHMENT_BATCH_SIZE)
        .map((entry) => enrichContentEntry(entry, fetchMetadata))
    );
    if (isExpired()) return entries;
    result.push(...batch);
  }
  return result;
}

export async function enrichContentEntries(
  entries: ContentEntry[],
  options: {
    timeoutMs?: number;
    fetchMetadata?: MetadataFetcher;
  } = {}
): Promise<ContentEntry[]> {
  if (entries.length === 0) return [];

  const timeoutMs = options.timeoutMs ?? CONTENT_ENRICHMENT_TIMEOUT_MS;
  const fetchMetadata = options.fetchMetadata ?? fetchContentMetadata;
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<ContentEntry[]>((resolve) => {
    timer = setTimeout(() => {
      expired = true;
      resolve(entries);
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      enrichInBatches(entries, fetchMetadata, () => expired),
      timeout,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
