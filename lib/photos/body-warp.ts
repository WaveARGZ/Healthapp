/** Browser-only, deterministic body-shape preview. No photo is uploaded. */

export type BodyLevel = "shoulder" | "waist" | "hip";
export type BodySide = "left" | "right";
export type BodyLandmarks = Record<BodyLevel, Record<BodySide, { x: number; y: number }>>;

export interface BodyPattern {
  id: "natural" | "defined" | "strong";
  label: string;
  description: string;
  shoulder: number;
  waist: number;
  hip: number;
  thigh: number;
  clarity: number;
}

// Change these values after comparing the six results with actual front/back photos.
export const bodyPatterns: readonly BodyPattern[] = [
  { id: "natural", label: "1. 自然", description: "軽く引き締める", shoulder: 1.04, waist: 0.95, hip: 1, thigh: 0.99, clarity: 0.18 },
  { id: "defined", label: "2. カット", description: "輪郭と陰影を強調", shoulder: 1.09, waist: 0.88, hip: 0.99, thigh: 0.97, clarity: 0.4 },
  { id: "strong", label: "3. 強め", description: "差が分かる変化", shoulder: 1.15, waist: 0.8, hip: 0.97, thigh: 0.94, clarity: 0.65 },
];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (t: number) => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };

async function decodeImage(source: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = source;
  await image.decode();
  return image;
}

function canvasFor(image: HTMLImageElement, maxWidth: number, maxHeight: number): HTMLCanvasElement {
  const scale = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("画像編集に対応したブラウザが必要です。");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export async function normalizePhoto(source: string): Promise<string> {
  const image = await decodeImage(source);
  return canvasFor(image, 1000, 1400).toDataURL("image/jpeg", 0.82);
}

function pixelAt(data: Uint8ClampedArray, width: number, x: number, y: number): [number, number, number] {
  const index = (y * width + x) * 4;
  return [data[index], data[index + 1], data[index + 2]];
}

function distance(a: readonly number[], b: readonly number[]) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function scanBodyEdge(data: Uint8ClampedArray, width: number, height: number, yRatio: number, centerX: number, background: readonly number[]) {
  const y = Math.round(yRatio * (height - 1));
  const foreground = (x: number) => distance(pixelAt(data, width, x, y), background) > 48;
  const segments: Array<{ left: number; right: number }> = [];
  let start = -1;
  let lastForeground = -1;
  for (let x = Math.round(width * 0.06); x < width * 0.94; x += 1) {
    if (foreground(x)) {
      if (start < 0) start = x;
      lastForeground = x;
    } else if (start >= 0 && x - lastForeground >= 5) {
      segments.push({ left: start, right: lastForeground });
      start = -1;
    }
  }
  if (start >= 0) segments.push({ left: start, right: lastForeground });
  const candidates = segments.filter(({ left, right }) => right - left >= width * 0.17 && right - left <= width * 0.8);
  const best = candidates.sort((a, b) =>
    Math.abs((a.left + a.right) / 2 / width - centerX) - Math.abs((b.left + b.right) / 2 / width - centerX))[0];
  if (!best || Math.abs((best.left + best.right) / 2 / width - centerX) > 0.25) return null;
  return { left: best.left / width, right: best.right / width };
}

export function estimateLandmarks(image: ImageData): { landmarks: BodyLandmarks; automatic: boolean } {
  const { width, height, data } = image;
  const cornerInset = Math.max(2, Math.round(Math.min(width, height) * 0.02));
  const corners = [
    pixelAt(data, width, cornerInset, cornerInset),
    pixelAt(data, width, width - 1 - cornerInset, cornerInset),
    pixelAt(data, width, cornerInset, height - 1 - cornerInset),
    pixelAt(data, width, width - 1 - cornerInset, height - 1 - cornerInset),
  ];
  const background = [0, 1, 2].map((channel) => corners.reduce((sum, color) => sum + color[channel], 0) / corners.length);
  const simpleBackground = corners.every((color) => distance(color, background) < 55);
  const levels: Array<[BodyLevel, number, number]> = [["shoulder", 0.3, 0.25], ["waist", 0.49, 0.18], ["hip", 0.63, 0.23]];
  const fallbackCenter = 0.5;
  const waistBounds = simpleBackground ? scanBodyEdge(data, width, height, 0.49, fallbackCenter, background) : null;
  const center = waistBounds ? (waistBounds.left + waistBounds.right) / 2 : fallbackCenter;
  let detected = 0;
  const landmarks = {} as BodyLandmarks;
  for (const [level, y, fallbackHalfWidth] of levels) {
    const bounds = simpleBackground ? scanBodyEdge(data, width, height, y, center, background) : null;
    if (bounds) detected += 1;
    landmarks[level] = {
      left: { x: bounds ? bounds.left : center - fallbackHalfWidth, y },
      right: { x: bounds ? bounds.right : center + fallbackHalfWidth, y },
    };
  }
  return { landmarks, automatic: detected >= 2 };
}

function levelAt(landmarks: BodyLandmarks, y: number) {
  const shoulderY = (landmarks.shoulder.left.y + landmarks.shoulder.right.y) / 2;
  const waistY = (landmarks.waist.left.y + landmarks.waist.right.y) / 2;
  const hipY = (landmarks.hip.left.y + landmarks.hip.right.y) / 2;
  if (y <= shoulderY) return { left: landmarks.shoulder.left.x, right: landmarks.shoulder.right.x };
  if (y <= waistY) {
    const t = smoothstep((y - shoulderY) / Math.max(0.01, waistY - shoulderY));
    return { left: mix(landmarks.shoulder.left.x, landmarks.waist.left.x, t), right: mix(landmarks.shoulder.right.x, landmarks.waist.right.x, t) };
  }
  if (y <= hipY) {
    const t = smoothstep((y - waistY) / Math.max(0.01, hipY - waistY));
    return { left: mix(landmarks.waist.left.x, landmarks.hip.left.x, t), right: mix(landmarks.waist.right.x, landmarks.hip.right.x, t) };
  }
  return { left: landmarks.hip.left.x, right: landmarks.hip.right.x };
}

function scaleAt(y: number, landmarks: BodyLandmarks, pattern: BodyPattern) {
  const shoulderY = (landmarks.shoulder.left.y + landmarks.shoulder.right.y) / 2;
  const waistY = (landmarks.waist.left.y + landmarks.waist.right.y) / 2;
  const hipY = (landmarks.hip.left.y + landmarks.hip.right.y) / 2;
  if (y < shoulderY - 0.1) return 1;
  if (y < shoulderY) return mix(1, pattern.shoulder, smoothstep((y - shoulderY + 0.1) / 0.1));
  if (y < waistY) return mix(pattern.shoulder, pattern.waist, smoothstep((y - shoulderY) / Math.max(0.01, waistY - shoulderY)));
  if (y < hipY) return mix(pattern.waist, pattern.hip, smoothstep((y - waistY) / Math.max(0.01, hipY - waistY)));
  if (y < hipY + 0.17) return mix(pattern.hip, pattern.thigh, smoothstep((y - hipY) / 0.17));
  if (y < hipY + 0.31) return mix(pattern.thigh, 1, smoothstep((y - hipY - 0.17) / 0.14));
  return 1;
}

function sourceXFor(targetX: number, center: number, width: number, factor: number) {
  const offset = targetX - center;
  const sign = Math.sign(offset);
  const distanceFromCenter = Math.abs(offset);
  const warpedEdge = width * factor;
  const outerEdge = width * 2.6;
  if (distanceFromCenter <= warpedEdge) return center + sign * distanceFromCenter / factor;
  if (distanceFromCenter < outerEdge) {
    const sourceDistance = width + (distanceFromCenter - warpedEdge) * (outerEdge - width) / (outerEdge - warpedEdge);
    return center + sign * sourceDistance;
  }
  return targetX;
}

export function warpPixels(source: ImageData, landmarks: BodyLandmarks, pattern: BodyPattern): ImageData {
  const { width, height, data } = source;
  const output = new ImageData(width, height);
  const destination = output.data;
  for (let y = 0; y < height; y += 1) {
    const yRatio = y / height;
    const { left, right } = levelAt(landmarks, yRatio);
    const center = (left + right) * width / 2;
    const leftWidth = Math.max(width * 0.05, (center / width - left) * width);
    const rightWidth = Math.max(width * 0.05, (right - center / width) * width);
    const factor = scaleAt(yRatio, landmarks, pattern);
    for (let x = 0; x < width; x += 1) {
      const sourceX = clamp(sourceXFor(x, center, x < center ? leftWidth : rightWidth, factor), 0, width - 1);
      const x0 = Math.floor(sourceX);
      const x1 = Math.min(width - 1, x0 + 1);
      const blend = sourceX - x0;
      const first = (y * width + x0) * 4;
      const second = (y * width + x1) * 4;
      const target = (y * width + x) * 4;
      const withinBody = Math.abs(sourceX - center) < (sourceX < center ? leftWidth : rightWidth) * 0.94;
      const withinTorso = yRatio > (landmarks.shoulder.left.y + landmarks.shoulder.right.y) / 2 && yRatio < (landmarks.hip.left.y + landmarks.hip.right.y) / 2;
      for (let channel = 0; channel < 3; channel += 1) {
        const value = mix(data[first + channel], data[second + channel], blend);
        if (withinBody && withinTorso) {
          const nearLeft = (y * width + Math.max(0, x0 - 2)) * 4 + channel;
          const nearRight = (y * width + Math.min(width - 1, x0 + 2)) * 4 + channel;
          const nearUp = (Math.max(0, y - 2) * width + x0) * 4 + channel;
          const nearDown = (Math.min(height - 1, y + 2) * width + x0) * 4 + channel;
          const localMean = (data[nearLeft] + data[nearRight] + data[nearUp] + data[nearDown]) / 4;
          destination[target + channel] = clamp(value + (value - localMean) * pattern.clarity + (value - 128) * pattern.clarity * 0.08, 0, 255);
        } else destination[target + channel] = value;
      }
      destination[target + 3] = 255;
    }
  }
  return output;
}

export async function prepareBodyPhoto(source: string): Promise<{ image: ImageData; landmarks: BodyLandmarks; automatic: boolean }> {
  const image = await decodeImage(source);
  const canvas = canvasFor(image, 600, 900);
  const pixels = canvas.getContext("2d", { willReadFrequently: true })?.getImageData(0, 0, canvas.width, canvas.height);
  if (!pixels) throw new Error("画像を読み取れませんでした。");
  return { image: pixels, ...estimateLandmarks(pixels) };
}

export function renderBodyPattern(image: ImageData, landmarks: BodyLandmarks, pattern: BodyPattern): string {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext("2d")?.putImageData(warpPixels(image, landmarks, pattern), 0, 0);
  return canvas.toDataURL("image/jpeg", 0.88);
}
