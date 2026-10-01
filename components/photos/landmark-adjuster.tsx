"use client";

/* eslint-disable @next/next/no-img-element -- The locally resized photo is positioned under interactive landmarks. */
import { useState, type PointerEvent } from "react";
import type { BodyLandmarks, BodyLevel, BodySide } from "@/lib/photos/body-warp";
import { bodyPhotoViewLabels, type BodyPhotoView } from "@/types/progress";

const levels: BodyLevel[] = ["shoulder", "waist", "hip"];
const levelLabels: Record<BodyLevel, string> = { shoulder: "肩", waist: "ウエスト", hip: "腰" };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function LandmarkAdjuster({ source, view, initial, automatic, onCommit }: {
  source: string;
  view: BodyPhotoView;
  initial: BodyLandmarks;
  automatic: boolean;
  onCommit: (points: BodyLandmarks) => void;
}) {
  const [points, setPoints] = useState(initial);

  function movePoint(event: PointerEvent<HTMLButtonElement>, level: BodyLevel, side: BodySide, allowReleased = false): BodyLandmarks | null {
    if (!allowReleased && event.buttons === 0) return null;
    const rect = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!rect) return null;
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    const otherX = points[level][side === "left" ? "right" : "left"].x;
    const boundedX = side === "left" ? Math.min(clamp(x, 0.05, 0.9), otherX - 0.07) : Math.max(clamp(x, 0.1, 0.95), otherX + 0.07);
    const minY = level === "shoulder" ? 0.14 : level === "waist" ? points.shoulder.left.y + 0.08 : points.waist.left.y + 0.08;
    const maxY = level === "shoulder" ? points.waist.left.y - 0.08 : level === "waist" ? points.hip.left.y - 0.08 : 0.84;
    const next = {
      ...points,
      [level]: {
        ...points[level],
        [side]: { x: boundedX, y: clamp(y, minY, maxY) },
      },
    };
    setPoints(next);
    return next;
  }

  function finish(event: PointerEvent<HTMLButtonElement>, level: BodyLevel, side: BodySide) {
    const final = movePoint(event, level, side, true) ?? points;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    onCommit(final);
  }

  return <div className="mt-3">
    <p className="text-xs leading-5 text-[var(--muted)]">{automatic ? "輪郭点を自動推定しました。" : "背景から輪郭を判断できなかったため、中央配置を仮定しています。"} 青い6点を肩・ウエスト・腰の左右に合わせてください。指を離すと再生成します。</p>
    <div className="relative mt-2 overflow-hidden rounded bg-[var(--sand)]">
      <img src={source} alt={`${bodyPhotoViewLabels[view]}の輪郭点調整`} className="block w-full" />
      <div className="absolute inset-0">
        {levels.flatMap((level) => (["left", "right"] as const).map((side) =>
          <button
            key={`${level}-${side}`}
            type="button"
            aria-label={`${bodyPhotoViewLabels[view]}の${levelLabels[level]}・${side === "left" ? "左" : "右"}の点`}
            onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
            onPointerMove={(event) => { movePoint(event, level, side); }}
            onPointerUp={(event) => finish(event, level, side)}
            onPointerCancel={(event) => finish(event, level, side)}
            style={{ left: `${points[level][side].x * 100}%`, top: `${points[level][side].y * 100}%`, touchAction: "none" }}
            className="absolute grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full"
          ><span className="grid size-7 place-items-center rounded-full border-2 border-white bg-[#2997e7] text-[9px] font-bold text-white shadow-lg">{levelLabels[level][0]}</span></button>))}
      </div>
    </div>
  </div>;
}
