# Meal photo gallery

`/meals` lists public, optimized meal photos from Vercel Blob. Uploads run in the
`/api/meals/upload` Next.js route handler only while a request is being handled;
there is no resident process.

## Upload request

Send `POST /api/meals/upload` with:

- `Authorization: Bearer <MEAL_UPLOAD_TOKEN>`
- `Content-Type: multipart/form-data`
- `photo`: one JPEG no larger than 4 MiB
- `capturedAt`: an ISO 8601 timestamp with seconds and an explicit UTC offset,
  for example `2026-09-13T12:34:56+09:00`

The route authenticates before parsing the request, applies the EXIF orientation,
resizes the image to at most 1600 px on either edge, removes metadata by creating a
new WebP, and writes only that public derivative to Blob.

The Blob pathname has this form:

```text
meals/v1/YYYY-MM-DD/<reversible-capturedAt-token>--<content-and-time-sha256>.webp
```

The date folder comes from the timestamp's local date. The token retains the exact
timestamp and the UTC offset produced by the Shortcut for a future UI, although
`/meals` currently shows only the date. Photos exposes Date Taken as an absolute
instant; the Shortcut formats it in the device timezone used when it runs. It does
not independently recover the timezone in which an older photo was originally
taken, so uploading after a timezone change can shift the displayed day near
midnight. The token is encoding, not encryption: anyone who knows a public Blob URL
can recover that timestamp. No original filename, EXIF, or location metadata is
retained.

The digest is deterministic for the exact original JPEG bytes and `capturedAt`.
Retries therefore overwrite the same immutable-content path instead of creating
duplicate gallery entries.

A successful response includes that deterministic digest as the top-level `id`,
along with the public URL and local date. A Shortcut can use `id` as its stable
success receipt.

## Environment

Connecting a public Vercel Blob store supplies `BLOB_STORE_ID` and a rotating
`VERCEL_OIDC_TOKEN`; the SDK resolves them automatically. A static
`BLOB_READ_WRITE_TOKEN` is only an optional local/off-Vercel fallback. Set the
dedicated `MEAL_UPLOAD_TOKEN` separately and share it only with the Shortcut.
Never commit any credential.

The page is invalidated after a successful upload and has a one-day fallback
revalidation. This avoids spending the Hobby advanced-operation allowance on a
five-minute `list()` loop.
