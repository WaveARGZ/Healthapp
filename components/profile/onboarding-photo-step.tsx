"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ChangeEvent, useCallback, useEffect, useState } from "react";
import { BodyPhotoPicker } from "@/components/photos/body-photo-picker";
import { IdealBodyEditor } from "@/components/photos/ideal-body-editor";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";
import { bodyMakeClient } from "@/lib/api/client";
import { normalizePhotoFile } from "@/lib/photos/photo-file";
import { toDateInputValue } from "@/lib/utils/date";
import { createId } from "@/lib/utils/id";
import type { BodyPhotoView } from "@/types/progress";
import { isCloudConfigured } from "@/lib/cloud/config";
import { hasCloudSession } from "@/lib/auth/cognito-session";

type Photos = Partial<Record<BodyPhotoView, string>>;
type Ready = Record<BodyPhotoView, boolean>;
type ReadyIds = Partial<Record<BodyPhotoView, string>>;

export function OnboardingPhotoStep() {
  const router = useRouter();
  useEffect(() => { if (isCloudConfigured && !hasCloudSession()) router.replace("/login"); }, [router]);
  const [photos, setPhotos] = useState<Photos>({});
  const [ready, setReady] = useState<Ready>({ front: false, back: false });
  const [ids, setIds] = useState<ReadyIds>({});
  const [capturedAt, setCapturedAt] = useState(toDateInputValue());
  const [processingCount, setProcessingCount] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const frontReady = useCallback(() => setReady((current) => ({ ...current, front: true })), []);
  const backReady = useCallback(() => setReady((current) => ({ ...current, back: true })), []);

  async function choosePhoto(view: BodyPhotoView, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setProcessingCount((count) => count + 1);
    setNotice("");
    try {
      const photo = await normalizePhotoFile(file);
      setReady((current) => ({ ...current, [view]: false }));
      setPhotos((current) => ({ ...current, [view]: photo }));
      setIds((current) => ({ ...current, [view]: createId("photo") }));
    } catch {
      setNotice("写真を読み取れませんでした。JPEGまたはPNGでお試しください。");
    } finally {
      setProcessingCount((count) => count - 1);
      event.target.value = "";
    }
  }

  async function complete() {
    if (!photos.front || !photos.back || !ready.front || !ready.back || !ids.front || !ids.back) return;
    setIsSaving(true);
    setNotice("");
    const createdAt = new Date().toISOString();
    try {
      await bodyMakeClient.saveBodyPhoto({ id: ids.front, view: "front", imageUrl: photos.front, capturedAt, createdAt });
      await bodyMakeClient.saveBodyPhoto({ id: ids.back, view: "back", imageUrl: photos.back, capturedAt, createdAt });
      router.push("/dashboard");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "写真を保存できませんでした。この手順をスキップすることもできます。");
      setIsSaving(false);
    }
  }

  const completeReady = Boolean(photos.front && photos.back && ids.front && ids.back && ready.front && ready.back);
  return <main className="setup-page">
    <div className="mx-auto w-full max-w-[640px] pb-10">
      <Logo />
      <header className="setup-heading">
        <p className="setup-step">2 / 2　写真で目標を確認</p>
        <h1 className="setup-title">目標の姿を、写真から。</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">正面と背面の写真を撮るか選ぶと、それぞれ3段階の目標イメージを自動生成します。</p>
      </header>

      <Card className="mt-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-bold text-[var(--ink)]">現在の身体写真</p>
          <label className="text-xs text-[var(--muted)]">撮影日 <input type="date" aria-label="撮影日" value={capturedAt} onChange={(event) => setCapturedAt(event.target.value)} className="form-input ml-1 inline-block h-11 w-40" /></label>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <BodyPhotoPicker view="front" preview={photos.front} onChange={(event) => void choosePhoto("front", event)} />
          <BodyPhotoPicker view="back" preview={photos.back} onChange={(event) => void choosePhoto("back", event)} />
        </div>
        <p className="mt-4 text-xs leading-5 text-[var(--muted)]">明るい場所で、全身を中央に写すと輪郭を推定しやすくなります。編集は端末内で行います。{isCloudConfigured ? "保存時には元写真を非公開のアカウント領域へ送ります。" : "写真はサーバーへ送りません。"}</p>
      </Card>

      {processingCount > 0 && <p role="status" className="mt-3 text-center text-xs text-[var(--muted)]">写真を準備しています…</p>}
      {(photos.front || photos.back) && <section className="mt-8">
        <h2 className="section-title">理想の身体プレビュー</h2>
        <p className="mt-1 text-xs leading-5 text-[var(--muted)]">3パターンを見比べられます。画像は各カードから保存できます。</p>
        {photos.front && <IdealBodyEditor key={ids.front} source={photos.front} view="front" onReady={frontReady} />}
        {photos.back && <IdealBodyEditor key={ids.back} source={photos.back} view="back" onReady={backReady} />}
      </section>}

      {notice && <p role="alert" className="mt-4 rounded bg-white p-3 text-xs text-[#ad5a50]">{notice}</p>}
      <Button type="button" className="mt-8 w-full" onClick={() => void complete()} disabled={!completeReady || isSaving || processingCount > 0}>{isSaving ? "保存中..." : "写真を保存してホームへ"}</Button>
      {!completeReady && <p className="mt-2 text-center text-xs text-[var(--muted)]">正面・背面の写真と6枚のプレビューがそろうと進めます。</p>}
      <Link href="/dashboard" className="mt-5 block text-center text-xs font-bold text-[var(--muted)] underline underline-offset-2">写真はあとで登録する</Link>
      <p className="mt-6 text-center text-[11px] leading-5 text-[var(--muted)]">この画像は目標イメージ用の加工です。将来の身体や体脂肪率を予測するものではありません。</p>
    </div>
  </main>;
}
