import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import vm from "node:vm";
import { stripCanvasJpegMetadata } from "../../lib/drive/jpeg-metadata.mjs";
import { baselineJpeg, exifSegment, jpegSamples, withExif } from "./test-support/jpeg-fixtures.mjs";

const receiver = vm.createContext({});
vm.runInContext(readFileSync(new URL("../google-drive-training-ingest/Code.gs", import.meta.url), "utf8"), receiver);
const validate = (bytes) => receiver.assertCleanJpeg_(Array.from(bytes));
const strip = (bytes) => Buffer.from(stripCanvasJpegMetadata(bytes));
const serverStrip = (bytes) => Buffer.from(receiver.stripJpegMetadata_(Array.from(bytes, (b) => b > 127 ? b - 256 : b)));
const insert = (jpeg, segment, offset) => Buffer.concat([jpeg.subarray(0, offset), segment, jpeg.subarray(offset)]);
const segment = (marker, content) => {
  const payload = Buffer.from(content);
  const header = Buffer.from([0xff, marker, 0, 0]);
  header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([header, payload]);
};

test("baseline, progressive, grayscale, restart markers and ICC profiles survive byte-for-byte", () => {
  for (const [name, sample] of Object.entries(jpegSamples)) {
    const original = Buffer.from(sample, "base64");
    const cleaned = strip(original);
    assert.deepEqual(cleaned, original, name);
    assert.deepEqual(serverStrip(original), cleaned, name);
    assert.doesNotThrow(() => validate(cleaned), name);
    assert.deepEqual(strip(cleaned), cleaned, "sanitization is idempotent");
  }
});

test("metadata before, between and after scans is removed without touching compressed pixels", () => {
  for (const sample of Object.values(jpegSamples)) {
    const original = Buffer.from(sample, "base64");
    const positions = [2, original.length - 2];
    for (let offset = original.indexOf(Buffer.from([0xff, 0xda])); offset >= 0; offset = original.indexOf(Buffer.from([0xff, 0xda]), offset + 2)) positions.push(offset);
    for (const offset of positions) {
      const dirty = insert(original, exifSegment, offset);
      assert.throws(() => validate(dirty), /image_metadata_not_removed/);
      assert.deepEqual(strip(dirty), original);
      assert.deepEqual(serverStrip(dirty), original);
      assert.doesNotThrow(() => validate(strip(dirty)));
    }
  }
});

test("EXIF, XMP, IPTC, comments, thumbnails and unknown application payloads cannot pass through", () => {
  const privateText = "SYNTHETIC_GPS_AND_CAMERA_METADATA";
  for (const marker of [0xfe, ...Array.from({ length: 16 }, (_, index) => 0xe0 + index)]) {
    const dirty = insert(baselineJpeg, segment(marker, privateText), 2);
    const originalCopy = Buffer.from(dirty);
    const clean = strip(dirty);
    assert.deepEqual(clean, baselineJpeg);
    assert.deepEqual(serverStrip(dirty), clean);
    assert.deepEqual(dirty, originalCopy, "input is read-only");
    assert.equal(clean.includes(privateText), false);
  }
  for (const content of ["JFXX\0thumbnail", "JFIF\0\x01\x01\x00\x00\x01\x00\x01\x01\x01RGB", "ICC_PROFILE\0\0\0invalid"]) {
    const marker = content.startsWith("ICC") ? 0xe2 : 0xe0;
    const dirty = insert(baselineJpeg, segment(marker, content), 2);
    assert.deepEqual(strip(dirty), baselineJpeg);
    assert.deepEqual(serverStrip(dirty), baselineJpeg);
  }
});

test("all truncated inputs and malformed lengths, frames or trailing payloads fail closed", () => {
  const valid = withExif();
  for (let end = 0; end < valid.length; end++) {
    assert.throws(() => strip(valid.subarray(0, end)), /invalid_canvas_jpeg/);
    assert.throws(() => serverStrip(valid.subarray(0, end)), /invalid_jpeg/);
  }
  const badLength = Buffer.from(valid);
  badLength.writeUInt16BE(65535, 4);
  const emptyScan = Buffer.from([0xff, 0xd8, 0xff, 0xda, 0, 2, 0xff, 0xd9]);
  const unsupported = insert(baselineJpeg, segment(0xcc, "unsupported coding"), 2);
  const noFrame = Buffer.from(baselineJpeg);
  noFrame[noFrame.indexOf(Buffer.from([0xff, 0xc0])) + 1] = 0xe1;
  for (const bad of [badLength, emptyScan, unsupported, noFrame, Buffer.concat([valid, Buffer.from("trailing private data")]), Buffer.alloc(1_500_001)]) {
    assert.throws(() => strip(bad), /invalid_canvas_jpeg/);
    assert.throws(() => serverStrip(bad), /invalid_jpeg/);
  }
});

test("real JPEG decoders produce identical pixels after stripping metadata", () => {
  const pairs = Object.values(jpegSamples).map((sample) => {
    const original = Buffer.from(sample, "base64");
    const dirty = withExif(original);
    return [dirty.toString("base64"), strip(dirty).toString("base64")];
  });
  const result = execFileSync("python3", ["-B", "-c", `
import base64,io,json,sys
from PIL import Image
for pair in json.load(sys.stdin):
    images=[Image.open(io.BytesIO(base64.b64decode(data))) for data in pair]
    assert images[0].size==images[1].size
    assert images[0].convert('RGB').tobytes()==images[1].convert('RGB').tobytes()
print('identical pixels')
`], { input: JSON.stringify(pairs), encoding: "utf8", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } });
  assert.match(result, /identical pixels/);
});
