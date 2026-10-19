import assert from "node:assert/strict";
import test from "node:test";
import { getPortraitCrop } from "../lib/photos/camera-framing.ts";

test("縦向き映像は上下を中央で切り取り、ガイドの3:4比率を保つ", () => {
  assert.deepEqual(getPortraitCrop(1080, 1920), { x: 0, y: 240, width: 1080, height: 1440 });
});

test("横向き映像は左右を中央で切り取り、ガイドの3:4比率を保つ", () => {
  assert.deepEqual(getPortraitCrop(1920, 1080), { x: 555, y: 0, width: 810, height: 1080 });
});

test("映像サイズが未取得なら撮影を中断する", () => {
  assert.throws(() => getPortraitCrop(0, 1080));
  assert.throws(() => getPortraitCrop(Number.NaN, 1080));
});
