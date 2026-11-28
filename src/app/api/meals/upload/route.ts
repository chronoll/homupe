import { timingSafeEqual } from "node:crypto";
import { put } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { convertMealJpegToWebp } from "@/lib/meal-image";
import {
  buildMealPathname,
  createMealDigest,
  mealBlobAccessOptions,
  MAX_MEAL_IMAGE_BYTES,
  MAX_MEAL_REQUEST_BYTES,
  parseCapturedAt,
} from "@/lib/meals";

export const runtime = "nodejs";

function jsonError(code: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, error: code }, { status });
}

function isAuthorized(header: string | null, secret: string): boolean {
  if (!header?.startsWith("Bearer ")) {
    return false;
  }

  const supplied = Buffer.from(header.slice("Bearer ".length), "utf8");
  const expected = Buffer.from(secret, "utf8");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function isJpeg(buffer: Buffer): boolean {
  return (
    buffer.length >= 4 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  );
}

function isUploadedFile(value: FormDataEntryValue): value is File {
  return typeof value !== "string" && typeof value.arrayBuffer === "function";
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const uploadToken = process.env.MEAL_UPLOAD_TOKEN;
  if (!uploadToken) {
    return jsonError("service_unavailable", 503);
  }

  if (!isAuthorized(request.headers.get("authorization"), uploadToken)) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      {
        status: 401,
        headers: { "WWW-Authenticate": "Bearer" },
      },
    );
  }

  let blobAccessOptions: { token?: string };
  try {
    blobAccessOptions = mealBlobAccessOptions();
  } catch {
    return jsonError("service_unavailable", 503);
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    if (!/^\d+$/.test(contentLength)) {
      return jsonError("invalid_request", 400);
    }
    if (Number(contentLength) > MAX_MEAL_REQUEST_BYTES) {
      return jsonError("payload_too_large", 413);
    }
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data\s*;\s*boundary=/i.test(contentType)) {
    return jsonError("invalid_request", 400);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError("invalid_request", 400);
  }

  const photos = formData.getAll("photo");
  const capturedAtValues = formData.getAll("capturedAt");
  if (photos.length !== 1 || capturedAtValues.length !== 1) {
    return jsonError("invalid_request", 400);
  }

  const photo = photos[0];
  const capturedAtValue = capturedAtValues[0];
  if (!isUploadedFile(photo) || typeof capturedAtValue !== "string") {
    return jsonError("invalid_request", 400);
  }

  const parsedCapturedAt = parseCapturedAt(capturedAtValue);
  if (!parsedCapturedAt) {
    return jsonError("invalid_captured_at", 400);
  }

  if (photo.type.toLowerCase() !== "image/jpeg") {
    return jsonError("unsupported_media_type", 415);
  }
  if (photo.size === 0) {
    return jsonError("invalid_image", 422);
  }
  if (photo.size > MAX_MEAL_IMAGE_BYTES) {
    return jsonError("payload_too_large", 413);
  }

  let jpeg: Buffer;
  try {
    jpeg = Buffer.from(await photo.arrayBuffer());
  } catch {
    return jsonError("invalid_image", 422);
  }
  if (!isJpeg(jpeg)) {
    return jsonError("invalid_image", 422);
  }

  const pathname = buildMealPathname(jpeg, parsedCapturedAt.value);
  if (!pathname) {
    return jsonError("invalid_captured_at", 400);
  }
  const id = createMealDigest(jpeg, parsedCapturedAt.value);

  let webp: Buffer;
  try {
    webp = await convertMealJpegToWebp(jpeg);
  } catch {
    return jsonError("invalid_image", 422);
  }

  try {
    const blob = await put(pathname, webp, {
      ...blobAccessOptions,
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "image/webp",
      cacheControlMaxAge: 31_536_000,
      maximumSizeInBytes: MAX_MEAL_IMAGE_BYTES,
    });

    try {
      revalidatePath("/meals");
    } catch {
      // The upload succeeded; a cache invalidation failure must not cause a retry.
    }

    return NextResponse.json(
      {
        ok: true,
        id,
        photo: {
          url: blob.url,
          date: parsedCapturedAt.localDate,
        },
      },
      { status: 201 },
    );
  } catch {
    return jsonError("storage_unavailable", 503);
  }
}
