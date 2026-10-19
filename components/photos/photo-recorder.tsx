"use client";

import Image from "next/image";
import { type ChangeEvent, useEffect, useState } from "react";
import { BodyPhotoPicker } from "@/components/photos/body-photo-picker";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { bodyMakeClient } from "@/lib/api/client";
import { normalizePhotoFile } from "@/lib/photos/photo-file";
import { formatDate, toDateInputValue } from "@/lib/utils/date";
import { createId } from "@/lib/utils/id";
import { bodyPhotoViewLabels, type BodyPhotoEntry, type BodyPhotoView } from "@/types/progress";
import { isCloudConfigured } from "@/lib/cloud/config";
import { isFirebaseSelected } from "@/lib/firebase/config";

type Previews = Partial<Record<BodyPhotoView, string>>;

export function PhotoRecorder() {
  const [previews, setPreviews] = useState<Previews>({});
  const [capturedAt, setCapturedAt] = useState(toDateInputValue());
  const [photos, setPhotos] = useState<BodyPhotoEntry[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => { void loadPhotos(); }, []);

  async function loadPhotos() { setPhotos(await bodyMakeClient.getBodyPhotos()); }

  async function handleFile(view: BodyPhotoView, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    await processPhotoFile(view, file);
    event.target.value = "";
  }

  async function processPhotoFile(view: BodyPhotoView, file: File) {
    setNotice("写真を準備しています…");
    try {
      const normalized = await normalizePhotoFile(file);
      setPreviews((current) => ({ ...current, [view]: normalized }));
      setIsSaved(false);
      setNotice("写真を読み込みました。身体の形は変えずに記録できます。");
    } catch {
      setNotice("写真を読み取れませんでした。JPEGまたはPNGでお試しください。");
    }
  }

  async function savePhotos() {
    const items = Object.entries(previews) as Array<[BodyPhotoView, string]>;
    if (!items.length) { setNotice("正面または背面の写真を選択してください。"); return; }
    setIsSaving(true);
    setNotice("");
    try {
      for (const [view, imageUrl] of items) {
        await bodyMakeClient.saveBodyPhoto({ id: createId("photo"), view, imageUrl, capturedAt, createdAt: new Date().toISOString() });
      }
      setPreviews({});
      setIsSaved(true);
      setNotice(isCloudConfigured && !isFirebaseSelected ? "身体の形を変えず、写真を非公開のアカウント領域に保存しました。" : "身体の形を変えず、写真をこの端末に保存しました。");
      await loadPhotos();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "写真を保存できませんでした。");
    } finally { setIsSaving(false); }
  }

  async function deletePhoto(id: string) {
    await bodyMakeClient.deleteBodyPhoto(id);
    await loadPhotos();
  }

  const comparisons = (["front", "back"] as const).map((view) => {
    const latestPerDay = new Map<string, BodyPhotoEntry>();
    photos.filter((photo) => photo.view === view)
      .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt) || b.createdAt.localeCompare(a.createdAt))
      .forEach((photo) => { if (!latestPerDay.has(photo.capturedAt)) latestPerDay.set(photo.capturedAt, photo); });
    return { view, entries: [...latestPerDay.values()].slice(0, 2) };
  }).filter((group) => group.entries.length === 2);

  return <>
    <PageHeader title="身体写真" description="身体の形を変えない写真で、変化をふり返れます。" />
    <Card>
      <div className="mb-5 grid gap-4 sm:flex sm:items-end sm:justify-between"><div><p className="text-sm font-bold text-[var(--ink)]">今回の写真</p><p className="mt-1 text-xs leading-5 text-[var(--muted)]">正面・背面をそれぞれ選択</p></div><label className="block text-xs font-semibold text-[var(--ink-soft)] sm:w-44">撮影日<input type="date" aria-label="撮影日" value={capturedAt} onChange={(event) => { setCapturedAt(event.target.value); setIsSaved(false); }} className="form-input mt-2" /></label></div>
      <div className="grid grid-cols-2 gap-2 sm:gap-4"><BodyPhotoPicker view="front" preview={previews.front} onChange={(event) => void handleFile("front", event)} /><BodyPhotoPicker view="back" preview={previews.back} onChange={(event) => void handleFile("back", event)} /></div>
      <p className="mt-4 text-xs leading-5 text-[var(--ink-soft)]">正面・背面のどちらか1枚でも保存できます。カメラが使いづらい場合は、撮影済みの写真を選んでください。</p>
      <details className="mt-3 text-xs leading-6 text-[var(--muted)]"><summary className="min-h-11 cursor-pointer py-2">比較しやすい撮り方（任意）</summary><p>前回と同じ向き・明るさ・カメラの高さにすると変化を見比べやすくなります。全身が入らなくても保存できます。</p></details>
      <p className="mt-3 text-xs leading-5 text-[var(--muted)]">{isCloudConfigured && !isFirebaseSelected ? "写真は非公開のアカウント領域へ送られます。" : "写真はこの端末内に保存します。"}縦横比を保ったまま縮小・圧縮しますが、身体の形は変えません。</p>
    </Card>
    <Button type="button" className="mt-4 w-full" onClick={() => void savePhotos()} disabled={isSaving || isSaved || !previews.front && !previews.back}>{isSaving ? "保存中..." : isSaved ? "写真を保存済み" : isCloudConfigured && !isFirebaseSelected ? "写真を保存" : "写真を端末に保存"}</Button>
    {notice && <p className="mt-3 text-center text-xs font-medium text-[var(--sage-deep)]" role="status">{notice}</p>}

    {comparisons.length > 0 && <section className="mt-9"><h2 className="section-title">前回と最新の写真</h2><p className="mt-1 text-xs leading-5 text-[var(--muted)]">撮影日の違う写真を並べて表示します。輪郭補正はしません。</p><div className="mt-4 space-y-6">{comparisons.map(({ view, entries }) => <div key={view}><h3 className="mb-2 text-sm font-bold">{bodyPhotoViewLabels[view]}</h3><div className="grid grid-cols-2 gap-2 sm:gap-4">{[entries[1], entries[0]].map((photo, index) => <figure key={photo.id} className="min-w-0 overflow-hidden rounded-md border border-[var(--line)] bg-white"><div className="relative aspect-[3/4] bg-[var(--sand)]"><Image src={photo.imageUrl} alt={`${bodyPhotoViewLabels[view]}の${index === 0 ? "前回" : "最新"}写真`} fill unoptimized className="object-contain" /></div><figcaption className="px-2 py-3 text-center text-xs text-[var(--muted)]">{index === 0 ? "前回" : "最新"} · {formatDate(photo.capturedAt)}</figcaption></figure>)}</div></div>)}</div></section>}

    <section className="mt-9"><h2 className="section-title">これまでの写真</h2>{photos.length === 0 ? <div className="mt-4"><EmptyState title="まだ写真がありません" description="保存した正面・背面の写真がここに表示されます。" /></div> : <div className="mt-4 grid grid-cols-2 gap-3">{photos.map((photo) => <article key={photo.id} className="overflow-hidden rounded-md border border-[var(--line)] bg-white"><div className="relative aspect-[3/4] bg-[var(--sand)]"><Image src={photo.imageUrl} alt={`${bodyPhotoViewLabels[photo.view]}写真 ${formatDate(photo.capturedAt)}`} fill unoptimized className="object-contain" /></div><div className="flex items-start justify-between gap-1 pl-3 pr-1 pt-2"><div className="min-w-0 py-1"><p className="text-sm font-semibold">{bodyPhotoViewLabels[photo.view]}</p><p className="mt-1 text-xs leading-5 text-[var(--muted)]">{formatDate(photo.capturedAt)}</p></div><button type="button" aria-label={`${formatDate(photo.capturedAt)}の${bodyPhotoViewLabels[photo.view]}写真を削除`} onClick={() => void deletePhoto(photo.id)} className="delete-button shrink-0"><Icon name="trash" className="size-4" /></button></div></article>)}</div>}</section>
  </>;
}
