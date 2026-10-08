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
import { isCloudConfigured } from "@/lib/cloud/config";

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
      setNotice("写真を読み込みました。下のプレビューで3パターンを確認できます。");
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
      setNotice(isCloudConfigured ? "元写真を非公開のアカウント領域に保存しました。" : "元写真を端末に保存しました。編集画像は各パターンから保存できます。");
      await loadPhotos();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "写真を保存できませんでした。");
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
    setNotice("保存済みの写真を開きました。下のプレビューで3パターンを確認できます。");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return <>
    <PageHeader title="身体写真" description="正面と背面から、理想の身体の3段階を比較できます。" />
    <Card>
      <div className="mb-5 grid gap-4 sm:flex sm:items-end sm:justify-between"><div><p className="text-sm font-bold text-[var(--ink)]">今回の写真</p><p className="mt-1 text-xs leading-5 text-[var(--muted)]">正面・背面をそれぞれ選択</p></div><label className="block text-xs font-semibold text-[var(--ink-soft)] sm:w-44">撮影日<input type="date" aria-label="撮影日" value={capturedAt} onChange={(event) => { setCapturedAt(event.target.value); setIsSaved(false); }} className="form-input mt-2" /></label></div>
      <div className="grid grid-cols-2 gap-2 sm:gap-4"><BodyPhotoPicker view="front" preview={previews.front} onChange={(event) => void handleFile("front", event)} /><BodyPhotoPicker view="back" preview={previews.back} onChange={(event) => void handleFile("back", event)} /></div>
      <p className="mt-4 text-xs leading-5 text-[var(--muted)]">{isCloudConfigured ? "自動編集は端末内で処理します。保存すると元写真は非公開のアカウント領域へ送られます。単色背景・全身・正面向きの撮影が目安です。" : "選ぶだけで自動編集します。写真はサーバーへ送らず、この端末内で処理します。単色背景・全身・正面向きの撮影が目安です。"}</p>
    </Card>
    <Button type="button" className="mt-4 w-full" onClick={() => void savePhotos()} disabled={isSaving || isSaved || !previews.front && !previews.back}>{isSaving ? "保存中..." : isSaved ? "元写真を保存済み" : isCloudConfigured ? "元写真を保存" : "元写真を端末に保存"}</Button>
    {notice && <p className="mt-3 text-center text-xs font-medium text-[var(--sage-deep)]" role="status">{notice}</p>}

    {(previews.front || previews.back) && <section className="mt-8"><h2 className="section-title">自動編集プレビュー</h2><p className="mt-1 text-xs leading-5 text-[var(--muted)]">3パターンは見た目の比較用シミュレーションです。変形率は実際の写真を見ながら調整できます。</p>{previews.front && <IdealBodyEditor key={`front-${previews.front.slice(0, 60)}`} source={previews.front} view="front" />}{previews.back && <IdealBodyEditor key={`back-${previews.back.slice(0, 60)}`} source={previews.back} view="back" />}</section>}

    <section className="mt-9"><h2 className="section-title">これまでの写真</h2>{photos.length === 0 ? <div className="mt-4"><EmptyState title="まだ写真がありません" description="保存した正面・背面の写真がここに表示されます。" /></div> : <div className="mt-4 grid grid-cols-2 gap-3">{photos.map((photo) => <article key={photo.id} className="overflow-hidden rounded-md border border-[var(--line)] bg-white"><div className="relative aspect-[3/4] bg-[var(--sand)]"><Image src={photo.imageUrl} alt={`${bodyPhotoViewLabels[photo.view]}写真 ${formatDate(photo.capturedAt)}`} fill unoptimized className="object-contain" /></div><div className="flex items-start justify-between gap-1 pl-3 pr-1 pt-2"><div className="min-w-0 py-1"><p className="text-sm font-semibold">{bodyPhotoViewLabels[photo.view]}</p><p className="mt-1 text-xs leading-5 text-[var(--muted)]">{formatDate(photo.capturedAt)}</p></div><button type="button" aria-label={`${formatDate(photo.capturedAt)}の${bodyPhotoViewLabels[photo.view]}写真を削除`} onClick={() => void deletePhoto(photo.id)} className="delete-button shrink-0"><Icon name="trash" className="size-4" /></button></div><button type="button" onClick={() => editSavedPhoto(photo)} className="mt-2 min-h-12 w-full border-t border-[var(--line)] bg-white px-2 py-3 text-xs font-semibold text-[var(--sage-deep)] hover:bg-[var(--sage-soft)]">3パターンを見る</button></article>)}</div>}</section>
    <details className="mt-8 border-t border-[var(--line)] text-xs text-[var(--muted)]"><summary className="min-h-12 py-4">今後の比較機能について</summary><p className="pb-4 leading-6">過去写真の位置合わせ、半透明オーバーレイ、タイムラプスは今後追加予定です。</p></details>
  </>;
}
