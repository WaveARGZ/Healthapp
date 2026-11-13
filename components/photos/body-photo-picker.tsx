"use client";

import Image from "next/image";
import { type ChangeEvent } from "react";
import { Icon } from "@/components/ui/icon";
import { bodyPhotoViewLabels, type BodyPhotoView } from "@/types/progress";

export function BodyPhotoPicker({ view, preview, onChange }: {
  view: BodyPhotoView;
  preview?: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return <div className="min-w-0">
    <label className="group relative flex focus-within:outline-2 focus-within:outline-offset-4 focus-within:outline-[var(--sage-deep)] aspect-[3/4] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-[#bfc8c1] bg-[var(--sand)] text-center transition hover:border-[var(--sage-deep)] hover:bg-[var(--sage-soft)]">
      {preview ? <><Image src={preview} alt={`${bodyPhotoViewLabels[view]}写真のプレビュー`} fill unoptimized className="object-contain" /><span className="absolute inset-x-0 bottom-0 bg-[#19182f]/85 px-2 py-3 text-xs font-semibold text-white">{bodyPhotoViewLabels[view]} · 写真を選び直す</span></> : <div className="flex flex-col items-center px-2 py-4"><span className="grid size-11 place-items-center rounded-xl bg-white text-[var(--sage-deep)]"><Icon name="camera" className="size-5" /></span><span className="mt-2 text-sm font-bold text-[var(--ink)]">{bodyPhotoViewLabels[view]}写真</span><span className="mt-2 text-xs leading-5 text-[var(--muted)]">写真を選ぶ</span></div>}
      <input type="file" accept="image/*" aria-label={`${bodyPhotoViewLabels[view]}の身体写真を選択`} className="sr-only" onChange={onChange} />
    </label>
    <label className="mt-2 flex min-h-11 w-full cursor-pointer items-center justify-center gap-1 rounded-xl border border-[var(--sage-deep)] bg-white px-2 text-xs font-bold text-[var(--sage-deep)] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--sage-deep)] hover:bg-[var(--sage-soft)] sm:text-sm"><Icon name="camera" className="size-4 shrink-0" />カメラで撮る<input type="file" accept="image/*" capture="environment" aria-label={`${bodyPhotoViewLabels[view]}の身体写真をカメラで撮る`} className="sr-only" onChange={onChange} /></label>
  </div>;
}
