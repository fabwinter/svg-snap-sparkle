/**
 * Safe ImageData creation that avoids buffer-sharing issues with WASM modules.
 * 
 * The ImageData(array, w, h) constructor uses the array as a VIEW (no copy).
 * WASM modules (like esm-potrace-wasm) can grow memory or internally
 * manipulate buffers, causing "Offset should not be negative" errors.
 * 
 * This helper creates ImageData via the (w, h) constructor (which allocates
 * its own buffer), then copies the pixel data into it.
 */
export function createSafeImageData(
  pixels: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): ImageData {
  const imageData = new ImageData(width, height);
  const dst = imageData.data;
  const len = width * height * 4;
  for (let i = 0; i < len; i++) {
    dst[i] = pixels[i];
  }
  return imageData;
}
