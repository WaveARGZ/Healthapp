"use client";

import Image from "next/image";
import type { ChangeEvent } from "react";
import { Icon } from "@/components/ui/icon";
import { bodyPhotoViewLabels, type BodyPhotoView } from "@/types/progress";

export function BodyPhotoPicker({ view, preview, onChange }: {
  view: BodyPhotoView;
  preview?: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return <label className="group relative flex focus-within:outline-2 focus-within:outline-offset-4 focus-within:outline-[var(--sage-deep)] aspect-[3/4] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-md border border-dashed border-[#bfc8c1] bg-[var(--sand)] text-center transition hover:border-[var(--sage-deep)]">
    {preview ? <Image src={preview} alt={`${bodyPhotoViewLabels[view]}写真のプレビュー`} fill unoptimized className="object-cover" /> : <><span className="grid size-11 place-items-center text-[var(--sage-deep)]"><Icon name="camera" className="size-5" /></span><span className="mt-3 text-sm font-bold text-[var(--ink)]">{bodyPhotoViewLabels[view]}写真</span><span className="mt-1 px-4 text-[11px] leading-4 text-[var(--muted)]">撮影・写真を選ぶ</span></>}
    <span className={`absolute bottom-3 rounded-sm px-2.5 py-1 text-[10px] font-bold ${preview ? "bg-black/55 text-white" : "bg-[var(--sage-soft)] text-[var(--sage-deep)]"}`}>{preview ? "変更する" : bodyPhotoViewLabels[view]}</span>
    <input type="file" accept="image/*" aria-label={`${bodyPhotoViewLabels[view]}の身体写真を撮影または選択`} className="sr-only" onChange={onChange} />
  </label>;
}
