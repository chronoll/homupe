import {
  enrichContentEntries,
  enrichContentEntry,
} from "@/lib/contentEntries";
import type { ContentEntry } from "@/lib/notion";

function entry(overrides: Partial<ContentEntry> = {}): ContentEntry {
  return {
    id: "entry",
    title: "Title",
    url: "https://example.com/item",
    imageUrl: null,
    media: "記事",
    date: "2026-11-28",
    body: "",
    pickup: false,
    ...overrides,
  };
}

describe("content entry enrichment", () => {
  it("fills a URL-only entry from metadata", async () => {
    const source = entry({
      title: "https://example.com/url-only",
      url: null,
    });
    const fetchMetadata = jest.fn().mockResolvedValue({
      url: source.title,
      title: "Metadata title",
      description: "",
      thumbnailUrl: "https://example.com/image.jpg",
    });

    await expect(enrichContentEntry(source, fetchMetadata)).resolves.toEqual({
      ...source,
      title: "Metadata title",
      url: source.title,
      imageUrl: "https://example.com/image.jpg",
    });
  });

  it("derives the existing YouTube thumbnail without fetching metadata", async () => {
    const fetchMetadata = jest.fn();
    const source = entry({ url: "https://youtu.be/video_123" });

    await expect(enrichContentEntry(source, fetchMetadata)).resolves.toEqual({
      ...source,
      imageUrl: "https://i.ytimg.com/vi/video_123/mqdefault.jpg",
    });
    expect(fetchMetadata).not.toHaveBeenCalled();
  });

  it("keeps the source entry when metadata fetching fails", async () => {
    const source = entry();
    const fetchMetadata = jest.fn().mockRejectedValue(new Error("offline"));

    await expect(enrichContentEntry(source, fetchMetadata)).resolves.toEqual(source);
  });

  it("uses one deadline when more than one batch is stalled", async () => {
    jest.useFakeTimers();
    const sources = Array.from({ length: 11 }, (_, index) =>
      entry({ id: `entry-${index}`, url: `https://example.com/${index}` })
    );
    const fetchMetadata = jest.fn(
      () => new Promise<never>(() => undefined)
    );

    const enrichment = enrichContentEntries(sources, {
      timeoutMs: 1000,
      fetchMetadata,
    });
    await jest.advanceTimersByTimeAsync(1000);

    await expect(enrichment).resolves.toEqual(sources);
    expect(fetchMetadata).toHaveBeenCalledTimes(5);
    jest.useRealTimers();
  });

  it("does not start another batch when the first settles after the deadline", async () => {
    jest.useFakeTimers();
    const sources = Array.from({ length: 11 }, (_, index) =>
      entry({ id: `entry-${index}`, url: `https://example.com/${index}` })
    );
    const fetchMetadata = jest.fn(
      (url: string) =>
        new Promise<{
          url: string;
          title: string;
          description: string;
          thumbnailUrl: string;
        }>((resolve) => {
          setTimeout(
            () => resolve({ url, title: "", description: "", thumbnailUrl: "" }),
            1500
          );
        })
    );

    const enrichment = enrichContentEntries(sources, {
      timeoutMs: 1000,
      fetchMetadata,
    });
    await jest.advanceTimersByTimeAsync(1000);
    await expect(enrichment).resolves.toEqual(sources);

    await jest.advanceTimersByTimeAsync(500);
    expect(fetchMetadata).toHaveBeenCalledTimes(5);
    jest.useRealTimers();
  });
});
