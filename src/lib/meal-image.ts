import sharp from "sharp";

const MAX_OUTPUT_EDGE = 1600;
const MAX_INPUT_PIXELS = 80_000_000;

export async function convertMealJpegToWebp(jpeg: Buffer): Promise<Buffer> {
  return sharp(jpeg, {
    failOn: "error",
    limitInputPixels: MAX_INPUT_PIXELS,
    sequentialRead: true,
  })
    .rotate()
    .resize({
      width: MAX_OUTPUT_EDGE,
      height: MAX_OUTPUT_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 82, effort: 4, smartSubsample: true })
    .toBuffer();
}
