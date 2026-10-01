"use client";

import Image from "next/image";
import { ChangeEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { bodyMakeClient } from "@/lib/api/client";
import { formatDate, toDateInputValue } from "@/lib/utils/date";
import { createId } from "@/lib/utils/id";
import { bodyPhotoViewLabels, type BodyPhotoEntry, type BodyPhotoView } from "@/types/progress";

type Previews = Partial<Record<BodyPhotoView, string>>;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
}

function PhotoPicker({ view, preview, onChange }: { view: BodyPhotoView; preview?: string; onChange: (event: ChangeEvent<HTMLInputElement>) => void }) {
  return <label className="group relative flex aspect-[3/4] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-[#bfc8c1] bg-[#f7f8f5] text-center transition hover:border-[var(--sage-deep)]">{preview ? <Image src={preview} alt={`${bodyPhotoViewLabels[view]}写真のプレビュー`} fill unoptimized className="object-cover" /> : <><span className="grid size-11 place-items-center rounded-2xl bg-white text-[var(--sage-deep)] shadow-sm"><Icon name="camera" className="size-5" /></span><span className="mt-3 text-sm font-bold text-[var(--ink)]">{bodyPhotoViewLabels[view]}写真</span><span className="mt-1 px-4 text-[11px] leading-4 text-[var(--muted)]">タップして選択</span></>}<span className={`absolute bottom-3 rounded-full px-2.5 py-1 text-[10px] font-bold ${preview ? "bg-black/55 text-white" : "bg-[var(--sage-soft)] text-[var(--sage-deep)]"}`}>{preview ? "変更する" : bodyPhotoViewLabels[view]}</span><input type="file" accept="image/*" className="sr-only" onChange={onChange} /></label>;
}

export function PhotoRecorder() {
  const [previews, setPreviews] = useState<Previews>({});
  const [capturedAt, setCapturedAt] = useState(toDateInputValue());
  const [photos, setPhotos] = useState<BodyPhotoEntry[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => { void loadPhotos(); }, []);
  async function loadPhotos() { setPhotos(await bodyMakeClient.getBodyPhotos()); }
  async function handleFile(view: BodyPhotoView, event: ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; if (!file) return; const imageUrl = await readAsDataUrl(file); setPreviews((current) => ({ ...current, [view]: imageUrl })); }
  async function savePhotos() {
    const items = Object.entries(previews) as Array<[BodyPhotoView, string]>;
    if (!items.length) { setNotice("正面または背面の写真を選択してください。"); return; }
    setIsSaving(true); setNotice("");
    try { await Promise.all(items.map(([view, imageUrl]) => bodyMakeClient.saveBodyPhoto({ id: createId("photo"), view, imageUrl, capturedAt, createdAt: new Date().toISOString() }))); setPreviews({}); setNotice("身体写真を保存しました。"); await loadPhotos(); } catch { setNotice("写真を保存できませんでした。画像サイズを小さくして再度お試しください。"); } finally { setIsSaving(false); }
  }
  async function deletePhoto(id: string) { await bodyMakeClient.deleteBodyPhoto(id); await loadPhotos(); }

  return <>
    <PageHeader eyebrow="BODY PHOTOS" title="身体写真を残す" description="同じ場所・光・距離で撮ると、変化を比べやすくなります。" />
    <Card><div className="mb-4 flex items-center justify-between"><div><p className="text-sm font-bold text-[var(--ink)]">今回の写真</p><p className="mt-1 text-xs text-[var(--muted)]">正面と背面を選択できます</p></div><label className="text-xs font-semibold text-[var(--muted)]">撮影日<input type="date" aria-label="撮影日" value={capturedAt} onChange={(event) => setCapturedAt(event.target.value)} className="ml-2 rounded-lg border border-[var(--line)] bg-white px-2 py-1.5 text-xs text-[var(--ink)] outline-none" /></label></div><div className="grid grid-cols-2 gap-3"><PhotoPicker view="front" preview={previews.front} onChange={(event) => void handleFile("front", event)} /><PhotoPicker view="back" preview={previews.back} onChange={(event) => void handleFile("back", event)} /></div><p className="mt-4 text-xs leading-5 text-[var(--muted)]">写真はこの端末内に保存されます。将来は安全なクラウド保存と比較機能に対応予定です。</p></Card>
    <Button type="button" className="mt-4 w-full" onClick={() => void savePhotos()} disabled={isSaving}>{isSaving ? "保存中..." : "身体写真を保存"}</Button>{notice ? <p className="mt-3 text-center text-xs font-medium text-[var(--sage-deep)]">{notice}</p> : null}
    <section className="mt-9"><h2 className="font-display text-xl font-semibold tracking-[-0.035em] text-[var(--ink)]">これまでの写真</h2>{photos.length === 0 ? <Card className="mt-3 text-center"><Icon name="camera" className="mx-auto size-6 text-[#c47a7a]" /><p className="mt-2 text-sm font-semibold text-[var(--ink)]">まだ写真がありません</p><p className="mt-1 text-xs text-[var(--muted)]">最初の一枚が、変化を知るスタートになります。</p></Card> : <div className="mt-3 grid grid-cols-2 gap-3">{photos.map((photo) => <div key={photo.id} className="group relative aspect-[3/4] overflow-hidden rounded-2xl bg-[var(--sand)]"><Image src={photo.imageUrl} alt={`${bodyPhotoViewLabels[photo.view]}写真 ${formatDate(photo.capturedAt)}`} fill unoptimized className="object-cover" /><div className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/65 to-transparent px-3 pb-3 pt-9"><div><p className="text-[10px] font-bold text-white">{bodyPhotoViewLabels[photo.view]}</p><p className="mt-0.5 text-[10px] text-white/75">{formatDate(photo.capturedAt)}</p></div><button type="button" aria-label="この身体写真を削除" onClick={() => void deletePhoto(photo.id)} className="rounded-lg bg-white/15 p-1.5 text-white backdrop-blur hover:bg-white/25"><Icon name="trash" className="size-3.5" /></button></div></div>)}</div>}</section>
    <section className="mt-8 rounded-2xl border border-dashed border-[var(--line)] p-5"><div className="flex gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--sage-soft)] text-[var(--sage-deep)]"><Icon name="sparkle" className="size-4" /></span><div><h2 className="text-sm font-bold text-[var(--ink)]">比較機能は準備中です</h2><p className="mt-1 text-xs leading-5 text-[var(--muted)]">過去写真の比較、半透明オーバーレイ、タイムラプスをここに追加できる構成です。</p></div></div></section>
  </>;
}
