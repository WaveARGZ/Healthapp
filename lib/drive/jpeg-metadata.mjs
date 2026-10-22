const invalidJpeg = () => new Error("invalid_canvas_jpeg");

/**
 * Strip application metadata from a freshly canvas-encoded JPEG, in memory.
 * Canvas must decode/redraw the original first (including its orientation).
 * Encoders can add EXIF of their own, so redraw alone is not a privacy check.
 * Keep only standard, thumbnail-free JFIF and ICC color profiles; never copy
 * EXIF/XMP/IPTC, comments, unknown APP payloads, or bytes after end-of-image.
 * This does not decode the image; the receiver still validates the full JPEG.
 * @param {Uint8Array} bytes
 * @returns {Uint8Array<ArrayBuffer>}
 */
export function stripCanvasJpegMetadata(bytes) {
  if (bytes.length < 4 || bytes.length > 1_500_000 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw invalidJpeg();
  const output = new Uint8Array(bytes.length);
  let written = 0;
  const copy = (start, end) => {
    output.set(bytes.subarray(start, end), written);
    written += end - start;
  };
  const matches = (start, end, signature) => end - start >= signature.length
    && Array.from(signature, (char, index) => bytes[start + index] === char.charCodeAt(0)).every(Boolean);
  copy(0, 2);
  let offset = 2;
  let inScan = false;
  let sawFrame = false;
  let sawScan = false;
  while (offset < bytes.length) {
    if (inScan) {
      const scanStart = offset;
      let scanBytes = 0;
      while (offset < bytes.length) {
        if (bytes[offset++] !== 0xff) { scanBytes++; continue; }
        const markerStart = offset - 1;
        while (bytes[offset] === 0xff) offset++;
        if (offset >= bytes.length) throw invalidJpeg();
        const marker = bytes[offset++];
        if (marker === 0) { scanBytes++; continue; } // FF 00 is an escaped pixel byte.
        if (marker >= 0xd0 && marker <= 0xd7) continue; // Restart markers are image data.
        if (!scanBytes) throw invalidJpeg();
        copy(scanStart, markerStart);
        offset = markerStart;
        inScan = false;
        break;
      }
      if (inScan) throw invalidJpeg();
    }
    const markerStart = offset;
    if (bytes[offset++] !== 0xff) throw invalidJpeg();
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9) {
      if (!sawFrame || !sawScan || offset !== bytes.length) throw invalidJpeg();
      copy(markerStart, offset);
      return output.slice(0, written);
    }
    const application = marker >= 0xe0 && marker <= 0xef;
    if (!application && marker !== 0xfe && ![0xc0, 0xc1, 0xc2, 0xc4, 0xda, 0xdb, 0xdd].includes(marker)) throw invalidJpeg();
    if (offset + 2 > bytes.length) throw invalidJpeg();
    const length = bytes[offset] * 256 + bytes[offset + 1];
    const end = offset + length;
    if (length < 2 || end > bytes.length) throw invalidJpeg();
    let keep = !application && marker !== 0xfe;
    if (marker === 0xe0) {
      // Do not retain JFXX thumbnails or arbitrary data disguised as APP0.
      keep = length === 16 && matches(offset + 2, end, "JFIF\0") && bytes[end - 2] === 0 && bytes[end - 1] === 0;
    } else if (marker === 0xe2) {
      // The profile belongs to the redrawn canvas, not the original photo.
      keep = length > 16 && matches(offset + 2, end, "ICC_PROFILE\0")
        && bytes[offset + 14] > 0 && bytes[offset + 14] <= bytes[offset + 15];
    } else if (marker >= 0xc0 && marker <= 0xc2) {
      const components = bytes[offset + 7];
      const height = bytes[offset + 3] * 256 + bytes[offset + 4];
      const width = bytes[offset + 5] * 256 + bytes[offset + 6];
      // Canvas output is grayscale or RGB, never a camera's CMYK JPEG.
      if (sawFrame || length < 11 || bytes[offset + 2] !== 8 || ![1, 3].includes(components)
        || length !== 8 + 3 * components || !width || !height || width > 1280 || height > 1280) throw invalidJpeg();
      sawFrame = true;
    } else if (marker === 0xda) {
      const components = bytes[offset + 2];
      if (!sawFrame || components < 1 || components > 3 || length !== 6 + 2 * components) throw invalidJpeg();
      sawScan = true;
      inScan = true;
    }
    if (keep) copy(markerStart, end);
    offset = end;
  }
  throw invalidJpeg();
}
