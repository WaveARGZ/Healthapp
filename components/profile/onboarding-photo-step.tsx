"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ChangeEvent, useEffect, useState } from "react";
import { BodyPhotoPicker } from "@/components/photos/body-photo-picker";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";
import { bodyMakeClient } from "@/lib/api/client";
import { normalizePhotoFile } from "@/lib/photos/photo-file";
import { toDateInputValue } from "@/lib/utils/date";
import { createId } from "@/lib/utils/id";
import type { BodyPhotoView } from "@/types/progress";
import { isCloudConfigured } from "@/lib/cloud/config";
import { isFirebaseSelected } from "@/lib/firebase/config";
import { hasCloudSession } from "@/lib/auth/cognito-session";

type Photos = Partial<Record<BodyPhotoView, string>>;
type ReadyIds = Partial<Record<BodyPhotoView, string>>;

export function OnboardingPhotoStep() {
  const router = useRouter();
  useEffect(() => { if (isCloudConfigured && !isFirebaseSelected && !hasCloudSession()) router.replace("/login"); }, [router]);
  const [photos, setPhotos] = useState<Photos>({});
  const [ids, setIds] = useState<ReadyIds>({});
  const [capturedAt, setCapturedAt] = useState(toDateInputValue());
  const [processingCount, setProcessingCount] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState("");

  async function choosePhoto(view: BodyPhotoView, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    await processPhotoFile(view, file);
    event.target.value = "";
  }

  async function processPhotoFile(view: BodyPhotoView, file: File) {
    setProcessingCount((count) => count + 1);
    setNotice("");
    try {
      const photo = await normalizePhotoFile(file);
      setPhotos((current) => ({ ...current, [view]: photo }));
      setIds((current) => ({ ...current, [view]: createId("photo") }));
    } catch {
      setNotice("写真を読み取れませんでした。JPEGまたはPNGでお試しください。");
    } finally {
      setProcessingCount((count) => count - 1);
    }
  }

  async function complete() {
    const selected = (["front", "back"] as const).filter((view) => photos[view] && ids[view]);
    if (!selected.length || isSaving || processingCount > 0) return;
    setIsSaving(true);
    setNotice("");
    const createdAt = new Date().toISOString();
    try {
      for (const view of selected) {
        await bodyMakeClient.saveBodyPhoto({ id: ids[view]!, view, imageUrl: photos[view]!, capturedAt, createdAt });
      }
      router.push("/dashboard");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "写真を保存できませんでした。この手順をスキップすることもできます。");
      setIsSaving(false);
    }
  }

  const completeReady = Boolean((photos.front && ids.front) || (photos.back && ids.back));
  return <main className="setup-page">
    <div className="mx-auto w-full max-w-[640px] pb-10">
      <Logo />
      <header className="setup-heading">
        <p className="setup-step">写真の記録（任意）</p>
        <h1 className="setup-title">今の姿を、そのまま記録。</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">身体の形を変える加工はしません。正面・背面どちらか1枚でも、撮らずに始めても大丈夫です。</p>
      </header>

      <Card className="mt-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-bold text-[var(--ink)]">現在の身体写真</p>
          <label className="flex min-w-0 items-center gap-3 text-xs text-[var(--muted)]"><span className="shrink-0">撮影日</span><input type="date" aria-label="撮影日" value={capturedAt} onChange={(event) => setCapturedAt(event.target.value)} className="form-input h-11 flex-1 sm:w-40" /></label>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4">
          <BodyPhotoPicker view="front" preview={photos.front} onChange={(event) => void choosePhoto("front", event)} />
          <BodyPhotoPicker view="back" preview={photos.back} onChange={(event) => void choosePhoto("back", event)} />
        </div>
        <p className="mt-4 text-xs leading-5 text-[var(--muted)]">カメラで撮るか、撮影済みの写真を選べます。撮影距離や補助線の調整は不要です。縦横比を保って縮小・圧縮します。{isCloudConfigured && !isFirebaseSelected ? "保存時には非公開のアカウント領域へ送ります。" : "写真はこの端末内だけに保存します。"}</p>
      </Card>

      {processingCount > 0 && <p role="status" className="mt-3 text-center text-xs text-[var(--muted)]">写真を準備しています…</p>}
      {notice && <p role="alert" className="mt-4 break-words rounded-md bg-[var(--coral-soft)] p-3 text-sm leading-6 text-[var(--coral)]">{notice}</p>}
      <Button type="button" className="mt-8 w-full" onClick={() => void complete()} disabled={!completeReady || isSaving || processingCount > 0}>{isSaving ? "保存中..." : "写真を保存してホームへ"}</Button>
      <Link href="/dashboard" className="mt-4 flex min-h-12 items-center justify-center text-center text-sm font-semibold text-[var(--muted)] underline underline-offset-4">写真はあとで登録する</Link>
      <p className="mt-5 text-center text-xs leading-6 text-[var(--muted)]">身体写真は体型の自動判定に使いません。気になる場合はこの手順をスキップしてください。</p>
    </div>
  </main>;
}
