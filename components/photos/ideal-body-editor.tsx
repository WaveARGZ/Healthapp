"use client";

/* eslint-disable @next/next/no-img-element -- Canvas data URLs are resized locally and cannot use server optimization. */
import { useCallback, useEffect, useRef, useState } from "react";
import { LandmarkAdjuster } from "@/components/photos/landmark-adjuster";
import { bodyPatterns, prepareBodyPhoto, renderBodyPattern, type BodyLandmarks, type BodyPattern } from "@/lib/photos/body-warp";
import { bodyPhotoViewLabels, type BodyPhotoView } from "@/types/progress";

type Results = Partial<Record<BodyPattern["id"], string>>;

export function IdealBodyEditor({ source, view, onReady }: { source: string; view: BodyPhotoView; onReady?: () => void }) {
  const [landmarks, setLandmarks] = useState<BodyLandmarks | null>(null);
  const [preparedImage, setPreparedImage] = useState<ImageData | null>(null);
  const generationRef = useRef(0);
  const [automatic, setAutomatic] = useState(false);
  const [results, setResults] = useState<Results>({});
  const [selected, setSelected] = useState<BodyPattern["id"]>("defined");
  const [adjusting, setAdjusting] = useState(false);
  const [status, setStatus] = useState("写真を解析しています…");

  const generate = useCallback(async (image: ImageData, points: BodyLandmarks) => {
    const generation = ++generationRef.current;
    setStatus("3パターンを作成しています…");
    const next: Results = {};
    for (const pattern of bodyPatterns) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (generation !== generationRef.current) return;
      next[pattern.id] = renderBodyPattern(image, points, pattern);
      if (generation !== generationRef.current) return;
      setResults({ ...next });
    }
    setStatus("");
    onReady?.();
  }, [onReady]);

  useEffect(() => {
    let cancelled = false;
    const generation = ++generationRef.current;
    void prepareBodyPhoto(source).then((prepared) => {
      if (cancelled || generation !== generationRef.current) return;
      setResults({});
      setPreparedImage(prepared.image);
      setLandmarks(prepared.landmarks);
      setAutomatic(prepared.automatic);
      void generate(prepared.image, prepared.landmarks);
    }).catch(() => {
      if (!cancelled) setStatus("画像を処理できませんでした。別の写真をお試しください。");
    });
    return () => { cancelled = true; generationRef.current += 1; };
  }, [source, generate]);

  const current = results[selected];
  return (
    <section className="mt-5 rounded-md border border-[var(--line)] bg-white p-3 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-[var(--ink)]">{bodyPhotoViewLabels[view]}：理想の身体プレビュー</h3>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">同じ写真から3段階を自動生成します。実際の将来の姿を保証するものではありません。</p>
        </div>
        <span className="shrink-0 rounded bg-[var(--sand)] px-2 py-1 text-xs font-medium text-[var(--muted)]">端末内で処理</span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {bodyPatterns.map((pattern) => (
          <button key={pattern.id} type="button" aria-pressed={selected === pattern.id} onClick={() => setSelected(pattern.id)} className={`overflow-hidden rounded border text-left ${selected === pattern.id ? "border-[var(--sage-deep)] ring-1 ring-[var(--sage-deep)]" : "border-[var(--line)]"}`}>
            <span className="block aspect-[3/4] bg-[var(--sand)]">
              {results[pattern.id] ? <img src={results[pattern.id]} alt={`${bodyPhotoViewLabels[view]} ${pattern.label}`} className="h-full w-full object-contain" /> : null}
            </span>
            <span className={`flex min-h-11 items-center justify-center px-1 py-2 text-xs font-semibold sm:text-sm ${selected === pattern.id ? "bg-[var(--sage-soft)] text-[var(--sage-deep)]" : "text-[var(--ink)]"}`}>{pattern.label}</span>
          </button>
        ))}
      </div>
      {status && <p role="status" className="mt-3 text-xs text-[var(--muted)]">{status}</p>}

      {current && (
        <div className="mt-4">
          <p className="text-sm font-semibold leading-6 text-[var(--ink)]">{bodyPatterns.find((pattern) => pattern.id === selected)?.description}</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <figure>
              <img src={source} alt={`${bodyPhotoViewLabels[view]}の元写真`} className="aspect-[3/4] w-full rounded bg-[var(--sand)] object-contain" />
              <figcaption className="mt-2 text-center text-xs text-[var(--muted)]">元写真</figcaption>
            </figure>
            <figure>
              <img src={current} alt={`${bodyPhotoViewLabels[view]}の編集後プレビュー`} className="aspect-[3/4] w-full rounded bg-[var(--sand)] object-contain" />
              <figcaption className="mt-2 text-center text-xs text-[var(--muted)]">編集後</figcaption>
            </figure>
          </div>
          <a href={current} download={`BodyMake-${view}-${selected}.jpg`} className="mt-4 flex min-h-12 items-center justify-center rounded border border-[var(--line)] px-3 py-3 text-center text-sm font-semibold text-[var(--sage-deep)]">この画像を保存</a>
        </div>
      )}

      <button type="button" onClick={() => setAdjusting((value) => !value)} className="text-link mt-4 underline underline-offset-2">{adjusting ? "輪郭点の調整を閉じる" : "輪郭点を確認・調整する"}</button>
      {adjusting && landmarks && <LandmarkAdjuster source={source} view={view} initial={landmarks} automatic={automatic} onCommit={(points) => { setLandmarks(points); if (preparedImage) void generate(preparedImage, points); }} />}
      <p className="mt-3 text-xs leading-5 text-[var(--muted)]">筋肉のラインは元写真にある陰影を強調します。写っていない筋肉を新たに描く処理ではありません。単色背景で全身を中央に写すと安定します。</p>
    </section>
  );
}
