import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "public", "images", "muscle-map-outline.png");
const outputDir = path.join(root, "public", "images", "muscle-map-masks");
const expectedSha256 = "6c9ac8d05800f565499494af37e38496f232371b4e7cc726efabae5ce8c08b01";
const alphaThreshold = 32;

// IDs are the enclosed transparent spaces in the approved outline, labeled from top-left
// with 4-neighbor flood fill. The outer background is ID 1; head IDs 2/3 and neck ID 4
// deliberately stay transparent. Updating the source image requires reviewing this map.
const maskRegions = {
  chest: [11, 12],
  back: [5, 6, 13, 14, 32, 33],
  arms: [15, 16, 17, 18, 20, 21, 27, 28, 38, 39, 40, 41, 48, 49, 52, 53, 70, 71],
  shoulders: [7, 8, 9, 10],
  core: [19, 22, 23, 25, 26, 29, 30, 34, 35, 54, 55, 59, 73],
  legs: [60, 61, 62, 63, 65, 66, 67, 68, 74, 75, 79, 80, 82, 83, 84, 85, 86, 87],
};

const sourceBytes = await readFile(sourcePath);
const actualSha256 = createHash("sha256").update(sourceBytes).digest("hex");
if (actualSha256 !== expectedSha256) {
  throw new Error(`The muscle map outline changed. Review the region IDs before regenerating masks (${actualSha256}).`);
}

const { data, info } = await sharp(sourceBytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;
if (width !== 1199 || height !== 1312 || channels !== 4) {
  throw new Error(`Unexpected outline dimensions: ${width}x${height}, ${channels} channels.`);
}

const pixelCount = width * height;
const labels = new Int32Array(pixelCount);
const queue = new Int32Array(pixelCount);
let nextId = 1;

for (let start = 0; start < pixelCount; start++) {
  if (labels[start] || data[start * channels + 3] >= alphaThreshold) continue;
  const id = nextId++;
  labels[start] = id;
  let head = 0;
  let tail = 1;
  queue[0] = start;

  while (head < tail) {
    const pixel = queue[head++];
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const neighbors = [
      ...(x > 0 ? [pixel - 1] : []),
      ...(x + 1 < width ? [pixel + 1] : []),
      ...(y > 0 ? [pixel - width] : []),
      ...(y + 1 < height ? [pixel + width] : []),
    ];
    for (const neighbor of neighbors) {
      if (labels[neighbor] || data[neighbor * channels + 3] >= alphaThreshold) continue;
      labels[neighbor] = id;
      queue[tail++] = neighbor;
    }
  }
}

if (nextId !== 88 || labels[0] !== 1) {
  throw new Error(`Unexpected outline components: ${nextId - 1}. Review the source and region IDs.`);
}

const allIds = Object.values(maskRegions).flat();
if (new Set(allIds).size !== allIds.length || allIds.some((id) => id < 5 || id >= nextId)) {
  throw new Error("Mask region IDs overlap or include the background, head, or neck.");
}

await mkdir(outputDir, { recursive: true });
for (const [name, ids] of Object.entries(maskRegions)) {
  const selected = new Set(ids);
  const mask = Buffer.alloc(pixelCount * 4);
  let filledPixels = 0;

  for (let pixel = 0; pixel < pixelCount; pixel++) {
    if (!selected.has(labels[pixel])) continue;
    const offset = pixel * 4;
    mask[offset] = 255;
    mask[offset + 1] = 255;
    mask[offset + 2] = 255;
    mask[offset + 3] = 255;
    filledPixels++;
  }

  // Extend the fill by one pixel beneath opaque outline pixels. This closes small
  // anti-aliased white seams without coloring another region or the outer background.
  const interior = Buffer.from(mask);
  for (let pixel = 0; pixel < pixelCount; pixel++) {
    if (interior[pixel * 4 + 3] === 0) continue;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    for (let dy = -1; dy <= 1; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= height) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        if (nx < 0 || nx >= width) continue;
        const neighbor = ny * width + nx;
        if (data[neighbor * channels + 3] < alphaThreshold) continue;
        const offset = neighbor * 4;
        mask[offset] = 255;
        mask[offset + 1] = 255;
        mask[offset + 2] = 255;
        mask[offset + 3] = 255;
      }
    }
  }

  const png = await sharp(mask, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9, palette: true })
    .toBuffer();
  await writeFile(path.join(outputDir, `${name}.png`), png);
  console.log(`${name}.png: ${filledPixels} interior pixels, ${png.length} bytes`);
}
