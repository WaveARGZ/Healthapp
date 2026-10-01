"use client";

import Image from "next/image";
import { type ChangeEvent, useEffect, useState } from "react";
import { BodyPhotoPicker } from "@/components/photos/body-photo-picker";
import { IdealBodyEditor } from "@/components/photos/ideal-body-editor";
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
    setNotice("写真を準備しています…");
    try {
      const normalized = await normalizePhotoFile(file);
      setPreviews((current) => ({ ...current, [view]: normalized }));
      setIsSaved(false);
      setNotice("写真から3パターンを自動生成しています。");
    } catch {
      setNotice("写真を読み取れませんでした。JPEGまたはPNGでお試しください。");
    }
    event.target.value = "";
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
      setIsSaved(true);
      setNotice("元写真を端末に保存しました。編集画像は各パターンから保存できます。");
      await loadPhotos();
    } catch {
      setNotice("写真を保存できませんでした。端末の空き容量をご確認ください。");
    } finally { setIsSaving(false); }
  }

  async function deletePhoto(id: string) {
    await bodyMakeClient.deleteBodyPhoto(id);
    await loadPhotos();
  }

  function editSavedPhoto(photo: BodyPhotoEntry) {
    setPreviews((current) => ({ ...current, [photo.view]: photo.imageUrl }));
    setCapturedAt(photo.capturedAt);
    setIsSaved(true);
    setNotice("保存済み写真から3パターンを作成しています。");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return <>
    <PageHeader title="身体写真" description="正面と背面から、理想の身体の3段階を比較できます。" />
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-bold text-[var(--ink)]">今回の写真</p><p className="mt-1 text-xs text-[var(--muted)]">正面・背面をそれぞれ選択</p></div><label className="text-xs font-semibold text-[var(--muted)]">撮影日<input type="date" aria-label="撮影日" value={capturedAt} onChange={(event) => { setCapturedAt(event.target.value); setIsSaved(false); }} className="form-input ml-2 inline-block h-11 w-40" /></label></div>
      <div className="grid grid-cols-2 gap-3"><BodyPhotoPicker view="front" preview={previews.front} onChange={(event) => void handleFile("front", event)} /><BodyPhotoPicker view="back" preview={previews.back} onChange={(event) => void handleFile("back", event)} /></div>
      <p className="mt-4 text-xs leading-5 text-[var(--muted)]">選ぶだけで自動編集します。写真はサーバーへ送らず、この端末内で処理します。単色背景・全身・正面向きの撮影が目安です。</p>
    </Card>
    <Button type="button" className="mt-4 w-full" onClick={() => void savePhotos()} disabled={isSaving || isSaved || !previews.front && !previews.back}>{isSaving ? "保存中..." : isSaved ? "元写真を保存済み" : "元写真を端末に保存"}</Button>
    {notice && <p className="mt-3 text-center text-xs font-medium text-[var(--sage-deep)]" role="status">{notice}</p>}

    {(previews.front || previews.back) && <section className="mt-8"><h2 className="section-title">自動編集プレビュー</h2><p className="mt-1 text-xs leading-5 text-[var(--muted)]">3パターンは見た目の比較用シミュレーションです。変形率は実際の写真を見ながら調整できます。</p>{previews.front && <IdealBodyEditor key={`front-${previews.front.slice(0, 60)}`} source={previews.front} view="front" />}{previews.back && <IdealBodyEditor key={`back-${previews.back.slice(0, 60)}`} source={previews.back} view="back" />}</section>}

    <section className="mt-9"><h2 className="section-title">これまでの写真</h2>{photos.length === 0 ? <div className="mt-4"><EmptyState title="まだ写真がありません" description="保存した正面・背面の写真がここに表示されます。" /></div> : <div className="mt-3 grid grid-cols-2 gap-3">{photos.map((photo) => <div key={photo.id} className="overflow-hidden rounded-md bg-[var(--sand)]"><div className="relative aspect-[3/4]"><Image src={photo.imageUrl} alt={`${bodyPhotoViewLabels[photo.view]}写真 ${formatDate(photo.capturedAt)}`} fill unoptimized className="object-cover" /><div className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/65 to-transparent px-3 pb-3 pt-9"><div><p className="text-[10px] font-bold text-white">{bodyPhotoViewLabels[photo.view]}</p><p className="mt-0.5 text-[10px] text-white/75">{formatDate(photo.capturedAt)}</p></div><button type="button" aria-label="この身体写真を削除" onClick={() => void deletePhoto(photo.id)} className="rounded-lg bg-white/15 p-1.5 text-white backdrop-blur hover:bg-white/25"><Icon name="trash" className="size-3.5" /></button></div></div><button type="button" onClick={() => editSavedPhoto(photo)} className="w-full bg-white px-2 py-2 text-xs font-bold text-[var(--sage-deep)]">3パターンを見る</button></div>)}</div>}</section>
    <details className="mt-8 border-t border-[var(--line)] py-4 text-xs text-[var(--muted)]"><summary>今後の比較機能について</summary><p className="mt-3 leading-6">過去写真の位置合わせ、半透明オーバーレイ、タイムラプスは今後追加予定です。</p></details>
  </>;
}
