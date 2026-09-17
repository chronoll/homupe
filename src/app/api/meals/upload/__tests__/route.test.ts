/**
 * @jest-environment node
 */

import { put } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { POST } from "@/app/api/meals/upload/route";
import { MAX_MEAL_IMAGE_BYTES, parseMealPathname } from "@/lib/meals";

jest.mock("@vercel/blob", () => ({
  list: jest.fn(),
  put: jest.fn(),
}));

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

const putMock = jest.mocked(put);
const revalidatePathMock = jest.mocked(revalidatePath);
const CAPTURED_AT = "2026-09-13T12:34:56.120+09:00";

function uploadRequest(
  photo: File,
  capturedAt = CAPTURED_AT,
  token = "upload-secret",
): NextRequest {
  const data = new FormData();
  data.set("photo", photo);
  data.set("capturedAt", capturedAt);

  return new NextRequest("https://homupe.example/api/meals/upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: data,
  });
}

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("POST /api/meals/upload", () => {
  let jpeg: Buffer;

  beforeAll(async () => {
    jpeg = await sharp({
      create: {
        width: 2000,
        height: 1000,
        channels: 3,
        background: "#c87951",
      },
    })
      .withMetadata({ orientation: 6 })
      .jpeg({ quality: 90 })
      .toBuffer();
  });

  beforeEach(() => {
    process.env.MEAL_UPLOAD_TOKEN = "upload-secret";
    process.env.BLOB_READ_WRITE_TOKEN = "blob-secret";
    delete process.env.BLOB_STORE_ID;
    delete process.env.VERCEL_OIDC_TOKEN;
    putMock.mockReset();
    revalidatePathMock.mockReset();
    putMock.mockResolvedValue({
      url: "https://example.public.blob.vercel-storage.com/meal.webp",
      downloadUrl: "https://example.public.blob.vercel-storage.com/meal.webp?download=1",
      pathname: "meal.webp",
      contentType: "image/webp",
      contentDisposition: 'inline; filename="meal.webp"',
      etag: "etag",
    });
  });

  afterAll(() => {
    delete process.env.MEAL_UPLOAD_TOKEN;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.BLOB_STORE_ID;
    delete process.env.VERCEL_OIDC_TOKEN;
  });

  test("authenticates before parsing the multipart body", async () => {
    const formData = jest.fn();
    const request = {
      headers: new Headers({ Authorization: "Bearer wrong-secret" }),
      formData,
    } as unknown as NextRequest;

    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
    expect(formData).not.toHaveBeenCalled();
    expect(putMock).not.toHaveBeenCalled();
  });

  test("fails cleanly before parsing when required configuration is missing", async () => {
    delete process.env.MEAL_UPLOAD_TOKEN;
    const formData = jest.fn();
    const request = {
      headers: new Headers(),
      formData,
    } as unknown as NextRequest;

    const response = await POST(request);

    expect(response.status).toBe(503);
    expect(await responseBody(response)).toEqual({ ok: false, error: "service_unavailable" });
    expect(formData).not.toHaveBeenCalled();
  });

  test("does not parse a validly authenticated request when Blob is unconfigured", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    const formData = jest.fn();
    const request = {
      headers: new Headers({ Authorization: "Bearer upload-secret" }),
      formData,
    } as unknown as NextRequest;

    const response = await POST(request);

    expect(response.status).toBe(503);
    expect(await responseBody(response)).toEqual({ ok: false, error: "service_unavailable" });
    expect(formData).not.toHaveBeenCalled();
  });

  test("uses a connected store's rotating OIDC credentials without a static token", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    process.env.BLOB_STORE_ID = "store_test";
    process.env.VERCEL_OIDC_TOKEN = "oidc-test-value";

    const response = await POST(
      uploadRequest(new File([jpeg], "meal.jpg", { type: "image/jpeg" })),
    );

    expect(response.status).toBe(201);
    expect(putMock).toHaveBeenCalledTimes(1);
    expect(putMock.mock.calls[0][2]).not.toHaveProperty("token");
  });

  test("rejects oversized requests before parsing", async () => {
    const formData = jest.fn();
    const request = {
      headers: new Headers({
        Authorization: "Bearer upload-secret",
        "Content-Length": String(MAX_MEAL_IMAGE_BYTES + 128 * 1024 + 1),
      }),
      formData,
    } as unknown as NextRequest;

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(formData).not.toHaveBeenCalled();
  });

  test("rejects timestamps without an offset and non-JPEG uploads", async () => {
    const missingOffset = await POST(
      uploadRequest(new File([jpeg], "meal.jpg", { type: "image/jpeg" }), "2026-09-13T12:34:56"),
    );
    expect(missingOffset.status).toBe(400);
    expect(await responseBody(missingOffset)).toEqual({
      ok: false,
      error: "invalid_captured_at",
    });

    const wrongMedia = await POST(
      uploadRequest(new File([jpeg], "meal.png", { type: "image/png" })),
    );
    expect(wrongMedia.status).toBe(415);
    expect(await responseBody(wrongMedia)).toEqual({
      ok: false,
      error: "unsupported_media_type",
    });
    expect(putMock).not.toHaveBeenCalled();
  });

  test("rejects invalid JPEG bytes and a JPEG over 4 MiB", async () => {
    const invalid = await POST(
      uploadRequest(
        new File([Buffer.from([0xff, 0xd8, 0xff, 0x00])], "meal.jpg", {
          type: "image/jpeg",
        }),
      ),
    );
    expect(invalid.status).toBe(422);
    expect(await responseBody(invalid)).toEqual({ ok: false, error: "invalid_image" });

    const oversizedBytes = Buffer.alloc(MAX_MEAL_IMAGE_BYTES + 1);
    oversizedBytes.set([0xff, 0xd8, 0xff]);
    const oversized = await POST(
      uploadRequest(new File([oversizedBytes], "meal.jpg", { type: "image/jpeg" })),
    );
    expect(oversized.status).toBe(413);
    expect(putMock).not.toHaveBeenCalled();
  });

  test("re-encodes to metadata-free WebP and writes an idempotent strict path", async () => {
    const response = await POST(
      uploadRequest(new File([jpeg], "private-original-name.jpg", { type: "image/jpeg" })),
    );

    expect(response.status).toBe(201);
    expect(await responseBody(response)).toEqual({
      ok: true,
      id: expect.stringMatching(/^[a-f0-9]{64}$/),
      photo: {
        url: "https://example.public.blob.vercel-storage.com/meal.webp",
        date: "2026-09-13",
      },
    });
    expect(putMock).toHaveBeenCalledTimes(1);

    const [pathname, uploaded, options] = putMock.mock.calls[0];
    expect(pathname).toMatch(/^meals\/v1\/2026-09-13\/.+--[a-f0-9]{64}\.webp$/);
    expect(pathname).not.toContain("private-original-name");
    expect(parseMealPathname(pathname)).toMatchObject({
      capturedAt: CAPTURED_AT,
      offset: "+09:00",
    });
    expect(options).toMatchObject({
      token: "blob-secret",
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "image/webp",
    });

    const outputMetadata = await sharp(uploaded as Buffer).metadata();
    expect(outputMetadata.format).toBe("webp");
    expect(Math.max(outputMetadata.width!, outputMetadata.height!)).toBeLessThanOrEqual(1600);
    expect(outputMetadata.exif).toBeUndefined();
    expect(outputMetadata.icc).toBeUndefined();
    expect(outputMetadata.xmp).toBeUndefined();
    expect(revalidatePathMock).toHaveBeenCalledWith("/meals");
  });

  test("does not expose raw storage failures", async () => {
    putMock.mockRejectedValueOnce(new Error("private provider detail"));

    const response = await POST(
      uploadRequest(new File([jpeg], "meal.jpg", { type: "image/jpeg" })),
    );

    expect(response.status).toBe(503);
    expect(JSON.stringify(await responseBody(response))).toBe(
      '{"ok":false,"error":"storage_unavailable"}',
    );
  });
});
