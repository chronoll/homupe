import { createHash } from "node:crypto";
import { list, type ListBlobResultBlob } from "@vercel/blob";

export const MEAL_BLOB_PREFIX = "meals/v1/";
export const MAX_MEAL_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_MEAL_REQUEST_BYTES = MAX_MEAL_IMAGE_BYTES + 128 * 1024;

const CAPTURED_AT_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;
const MEAL_PATH_PATTERN =
  /^meals\/v1\/(\d{4}-\d{2}-\d{2})\/([A-Za-z0-9_-]+)--([a-f0-9]{64})\.webp$/;

export interface ParsedCapturedAt {
  value: string;
  localDate: string;
  offset: string;
  instantMs: number;
}

export interface MealPhoto {
  pathname: string;
  url: string;
  capturedAt: string;
  localDate: string;
  offset: string;
  instantMs: number;
  digest: string;
}

export interface MealPhotoGroup {
  date: string;
  photos: MealPhoto[];
}

export class MealStorageUnavailableError extends Error {
  constructor() {
    super("Meal photo storage is unavailable");
    this.name = "MealStorageUnavailableError";
  }
}

export function mealBlobAccessOptions(
  explicitToken?: string,
): { token?: string } {
  if (explicitToken !== undefined) {
    if (!explicitToken) {
      throw new MealStorageUnavailableError();
    }
    return { token: explicitToken };
  }

  const storeId = process.env.BLOB_STORE_ID;
  const oidcToken = process.env.VERCEL_OIDC_TOKEN;
  if (Boolean(storeId) !== Boolean(oidcToken)) {
    throw new MealStorageUnavailableError();
  }
  if (storeId && oidcToken) {
    // Connected Vercel projects let the SDK resolve the rotating OIDC token.
    return {};
  }

  const legacyToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (!legacyToken) {
    throw new MealStorageUnavailableError();
  }
  return { token: legacyToken };
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leap ? 29 : 28;
  }

  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function parseCapturedAt(value: string): ParsedCapturedAt | null {
  const match = CAPTURED_AT_PATTERN.exec(value);
  if (!match) {
    return null;
  }

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , offset] =
    match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month) ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null;
  }

  if (offset !== "Z") {
    const offsetHours = Number(offset.slice(1, 3));
    const offsetMinutes = Number(offset.slice(4, 6));
    if (
      offsetMinutes > 59 ||
      offsetHours > 14 ||
      (offsetHours === 14 && offsetMinutes !== 0) ||
      offset === "-00:00"
    ) {
      return null;
    }
  }

  const instantMs = Date.parse(value);
  if (!Number.isFinite(instantMs)) {
    return null;
  }

  return {
    value,
    localDate: `${yearText}-${monthText}-${dayText}`,
    offset,
    instantMs,
  };
}

function encodeCapturedAt(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeCapturedAt(token: string): string | null {
  if (token.length > 96) {
    return null;
  }

  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    return encodeCapturedAt(decoded) === token ? decoded : null;
  } catch {
    return null;
  }
}

export function createMealDigest(jpeg: Buffer, capturedAt: string): string {
  return createHash("sha256")
    .update("meal-photo-v1\0", "utf8")
    .update(capturedAt, "utf8")
    .update("\0", "utf8")
    .update(jpeg)
    .digest("hex");
}

export function buildMealPathname(jpeg: Buffer, capturedAt: string): string | null {
  const parsed = parseCapturedAt(capturedAt);
  if (!parsed) {
    return null;
  }

  const timestampToken = encodeCapturedAt(parsed.value);
  const digest = createMealDigest(jpeg, parsed.value);
  return `${MEAL_BLOB_PREFIX}${parsed.localDate}/${timestampToken}--${digest}.webp`;
}

export function parseMealPathname(
  pathname: string,
): Omit<MealPhoto, "pathname" | "url"> | null {
  const match = MEAL_PATH_PATTERN.exec(pathname);
  if (!match) {
    return null;
  }

  const [, folderDate, timestampToken, digest] = match;
  const capturedAt = decodeCapturedAt(timestampToken);
  if (!capturedAt) {
    return null;
  }

  const parsed = parseCapturedAt(capturedAt);
  if (!parsed || parsed.localDate !== folderDate) {
    return null;
  }

  return {
    capturedAt: parsed.value,
    localDate: parsed.localDate,
    offset: parsed.offset,
    instantMs: parsed.instantMs,
    digest,
  };
}

function toMealPhoto(blob: ListBlobResultBlob): MealPhoto | null {
  const parsed = parseMealPathname(blob.pathname);
  if (!parsed) {
    return null;
  }

  return {
    pathname: blob.pathname,
    url: blob.url,
    ...parsed,
  };
}

export async function listMealPhotos(
  explicitToken?: string,
): Promise<MealPhoto[]> {
  const accessOptions = mealBlobAccessOptions(explicitToken);

  const photosByPath = new Map<string, MealPhoto>();
  const seenCursors = new Set<string>();
  let cursor: string | undefined;

  do {
    const page = await list({
      ...accessOptions,
      prefix: MEAL_BLOB_PREFIX,
      limit: 1000,
      cursor,
    });

    for (const blob of page.blobs) {
      const photo = toMealPhoto(blob);
      if (photo) {
        photosByPath.set(photo.pathname, photo);
      }
    }

    if (!page.hasMore) {
      break;
    }

    if (!page.cursor || seenCursors.has(page.cursor)) {
      throw new MealStorageUnavailableError();
    }

    seenCursors.add(page.cursor);
    cursor = page.cursor;
  } while (cursor);

  return [...photosByPath.values()].sort(
    (a, b) => b.instantMs - a.instantMs || b.pathname.localeCompare(a.pathname),
  );
}

export function groupMealPhotos(photos: MealPhoto[]): MealPhotoGroup[] {
  const groups = new Map<string, MealPhoto[]>();
  for (const photo of photos) {
    const group = groups.get(photo.localDate) ?? [];
    group.push(photo);
    groups.set(photo.localDate, group);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, groupedPhotos]) => ({ date, photos: groupedPhotos }));
}
