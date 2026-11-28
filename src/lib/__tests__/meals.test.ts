/**
 * @jest-environment node
 */

import { list, type ListBlobResultBlob } from "@vercel/blob";
import {
  buildMealPathname,
  groupMealPhotos,
  listMealPhotos,
  MealStorageUnavailableError,
  mealBlobAccessOptions,
  parseCapturedAt,
  parseMealPathname,
} from "@/lib/meals";

jest.mock("@vercel/blob", () => ({
  list: jest.fn(),
  put: jest.fn(),
}));

const listMock = jest.mocked(list);

function blob(pathname: string, url = `https://example.public.blob.vercel-storage.com/${pathname}`): ListBlobResultBlob {
  return {
    pathname,
    url,
    downloadUrl: url,
    size: 123,
    uploadedAt: new Date("2026-09-13T00:00:00Z"),
    etag: "etag",
  };
}

describe("meal capture timestamps and paths", () => {
  test("requires a real ISO 8601 timestamp with an explicit, valid offset", () => {
    expect(parseCapturedAt("2026-09-13T12:34:56+09:00")).toMatchObject({
      localDate: "2026-09-13",
      offset: "+09:00",
    });
    expect(parseCapturedAt("2024-02-29T23:59:59.123Z")).toMatchObject({
      localDate: "2024-02-29",
      offset: "Z",
    });

    for (const invalid of [
      "2026-09-13T12:34:56",
      "2026-02-29T12:34:56+09:00",
      "2026-09-13T24:00:00+09:00",
      "2026-09-13T12:34:60+09:00",
      "2026-09-13T12:34:56+14:01",
      "2026-09-13T12:34:56-00:00",
      " 2026-09-13T12:34:56+09:00",
    ]) {
      expect(parseCapturedAt(invalid)).toBeNull();
    }
  });

  test("builds an idempotent strict path and reversibly retains the timestamp", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const capturedAt = "2026-09-13T12:34:56.120+09:00";
    const first = buildMealPathname(jpeg, capturedAt);
    const retry = buildMealPathname(jpeg, capturedAt);

    expect(first).toBe(retry);
    expect(first).toMatch(/^meals\/v1\/2026-09-13\/.+--[a-f0-9]{64}\.webp$/);
    expect(parseMealPathname(first!)).toMatchObject({
      capturedAt,
      localDate: "2026-09-13",
      offset: "+09:00",
    });

    expect(buildMealPathname(Buffer.from([0xff, 0xd8, 0xff, 0x00]), capturedAt)).not.toBe(
      first,
    );
    expect(parseMealPathname(first!.replace("/2026-09-13/", "/2026-09-12/"))).toBeNull();
    expect(parseMealPathname(`outside/${first}`)).toBeNull();
  });
});

describe("meal Blob listing", () => {
  beforeEach(() => {
    listMock.mockReset();
    delete process.env.BLOB_STORE_ID;
    delete process.env.VERCEL_OIDC_TOKEN;
    delete process.env.BLOB_READ_WRITE_TOKEN;
  });

  afterAll(() => {
    delete process.env.BLOB_STORE_ID;
    delete process.env.VERCEL_OIDC_TOKEN;
    delete process.env.BLOB_READ_WRITE_TOKEN;
  });

  test("prefers connected-project OIDC and rejects partial credential state", () => {
    process.env.BLOB_STORE_ID = "store_test";
    process.env.VERCEL_OIDC_TOKEN = "oidc-test-value";
    expect(mealBlobAccessOptions()).toEqual({});

    delete process.env.VERCEL_OIDC_TOKEN;
    expect(() => mealBlobAccessOptions()).toThrow(MealStorageUnavailableError);
  });

  test("paginates only the strict prefix, ignores malformed entries, and groups by date", async () => {
    const newest = buildMealPathname(
      Buffer.from("newest"),
      "2026-09-13T20:00:00+09:00",
    )!;
    const olderSameDay = buildMealPathname(
      Buffer.from("older"),
      "2026-09-13T08:00:00+09:00",
    )!;
    const previousDay = buildMealPathname(
      Buffer.from("previous"),
      "2026-09-12T22:00:00+09:00",
    )!;

    listMock
      .mockResolvedValueOnce({
        blobs: [blob(olderSameDay), blob("meals/v1/not-a-meal.webp")],
        hasMore: true,
        cursor: "page-2",
      })
      .mockResolvedValueOnce({
        blobs: [blob(previousDay), blob(newest)],
        hasMore: false,
      });

    const photos = await listMealPhotos("blob-token");

    expect(listMock).toHaveBeenNthCalledWith(1, {
      token: "blob-token",
      prefix: "meals/v1/",
      limit: 1000,
      cursor: undefined,
    });
    expect(listMock).toHaveBeenNthCalledWith(2, {
      token: "blob-token",
      prefix: "meals/v1/",
      limit: 1000,
      cursor: "page-2",
    });
    expect(photos.map((photo) => photo.pathname)).toEqual([
      newest,
      olderSameDay,
      previousDay,
    ]);
    expect(groupMealPhotos(photos).map((group) => [group.date, group.photos.length])).toEqual([
      ["2026-09-13", 2],
      ["2026-09-12", 1],
    ]);
  });

  test("fails closed when storage is unconfigured or pagination is malformed", async () => {
    await expect(listMealPhotos("")).rejects.toBeInstanceOf(MealStorageUnavailableError);
    expect(listMock).not.toHaveBeenCalled();

    listMock.mockResolvedValueOnce({ blobs: [], hasMore: true });
    await expect(listMealPhotos("blob-token")).rejects.toBeInstanceOf(
      MealStorageUnavailableError,
    );
  });
});
