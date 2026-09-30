/**
 * Pure-JS cover → list thumb (no AI). Full covers stay ~1K; thumbs are small JPEGs.
 */
import Jimp from "jimp";
import {
  COMPOSITION_COVER_THUMB_EDGE,
  compositionCoverThumbObjectKey,
} from "./meditation-cover";

export { COMPOSITION_COVER_THUMB_EDGE, compositionCoverThumbObjectKey };

export async function resizeCoverBufferToThumbJpeg(
  input: Buffer,
  edge = COMPOSITION_COVER_THUMB_EDGE,
): Promise<Buffer> {
  const image = await Jimp.read(input);
  image.cover(edge, edge);
  image.quality(78);
  return image.getBufferAsync(Jimp.MIME_JPEG);
}
