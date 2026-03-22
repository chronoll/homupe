import { YouTubeVideo } from "@/lib/types";

interface OEmbedResponse {
  title: string;
  author_name: string;
  author_url: string;
  thumbnail_url: string;
}

function extractVideoId(url: string): string | null {
  // https://www.youtube.com/watch?v=VIDEO_ID
  // https://youtu.be/VIDEO_ID
  // https://youtu.be/VIDEO_ID?si=...
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]+)/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export async function fetchYouTubeMetadata(
  videoUrl: string
): Promise<YouTubeVideo | null> {
  const videoId = extractVideoId(videoUrl);
  if (!videoId) return null;

  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`;
    const res = await fetch(oembedUrl);
    if (!res.ok) return null;

    const data: OEmbedResponse = await res.json();

    return {
      id: videoId,
      title: data.title,
      channelName: data.author_name,
      channelUrl: data.author_url,
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    };
  } catch {
    return null;
  }
}

export async function fetchMultipleVideos(
  urls: string[]
): Promise<YouTubeVideo[]> {
  const results = await Promise.allSettled(urls.map(fetchYouTubeMetadata));
  return results
    .filter(
      (r): r is PromiseFulfilledResult<YouTubeVideo> =>
        r.status === "fulfilled" && r.value !== null
    )
    .map((r) => r.value);
}
