"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { analyzeFoodPhotoDetailed, type FoodPhotoCandidate } from "@/lib/food-ai/food-photo-analyzer";
import { foodCatalog } from "@/lib/food-ai/food-catalog";
import { applyPhotoNutritionUplift } from "@/lib/food-ai/photo-nutrition-estimate";
import { isSupportedFoodPhoto, requestGoogleAccountToken, sanitizeTrainingPhoto, submitFoodCorrectionToSharedDrive } from "@/lib/drive/google-drive-client";
import { useGoogleDriveClientId, useTrainingConnection, useTrainingDataEndpoint } from "@/hooks/use-google-drive-client-id";
import { createId } from "@/lib/utils/id";

type Nutrition = { calories: number; proteinG: number; fatG: number; carbsG: number };
type Phase = "idle" | "analyzing" | "ready" | "error" | "sending" | "sent";
const emptyNutrition: Nutrition = { calories: 0, proteinG: 0, fatG: 0, carbsG: 0 };
const nutritionFields: Array<[keyof Nutrition, string, string]> = [
  ["calories", "カロリー", "kcal"],
  ["proteinG", "たんぱく質", "g"],
  ["fatG", "脂質", "g"],
  ["carbsG", "炭水化物", "g"],
];

function plainName(name: string): string {
  return name.replace(/（\d+(?:\.\d+)?g）$/, "");
}

function normalizedName(name: string): string {
  return name.trim().normalize("NFKC").replace(/[\s　]+/g, "").toLocaleLowerCase();
}

export function PublicFoodPhoto() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<FoodPhotoCandidate[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [correctName, setCorrectName] = useState("");
  const [labelChecked, setLabelChecked] = useState(false);
  const [nutrition, setNutrition] = useState<Nutrition>(emptyNutrition);
  const [consent, setConsent] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");
  const [receiptId, setReceiptId] = useState("");
  const analysisGeneration = useRef(0);
  const previewUrl = useRef<string | null>(null);
  const submission = useRef<{ key: string; id: string; createdAt: string } | null>(null);
  const clientId = useGoogleDriveClientId();
  const endpoint = useTrainingDataEndpoint();
  const connection = useTrainingConnection(clientId, endpoint);

  useEffect(() => () => { if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); }, []);

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0];
    event.target.value = "";
    if (!next) return;
    if (!isSupportedFoodPhoto(next)) {
      analysisGeneration.current += 1;
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = null;
      setPreview(null);
      setFile(null);
      setCandidates([]);
      setLabelChecked(false);
      setConsent(false);
      setReceiptId("");
      submission.current = null;
      setMessage("20MB以下の食事写真を選んでください。");
      setPhase("error");
      return;
    }
    analysisGeneration.current += 1;
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = URL.createObjectURL(next);
    setPreview(previewUrl.current);
    setFile(next);
    setCandidates([]);
    setSelectedId("");
    setCorrectName("");
    setLabelChecked(false);
    setNutrition(emptyNutrition);
    setConsent(false);
    setReceiptId("");
    submission.current = null;
    setPhase("idle");
    setMessage("");
  }

  function selectCandidate(candidate: FoodPhotoCandidate) {
    setSelectedId(candidate.id);
    setCorrectName(plainName(candidate.food.name));
    setLabelChecked(false);
    const estimate = applyPhotoNutritionUplift(candidate.food);
    setNutrition({ calories: estimate.calories ?? 0, proteinG: estimate.proteinG ?? 0, fatG: estimate.fatG ?? 0, carbsG: estimate.carbsG ?? 0 });
  }

  async function analyze() {
    if (!file || phase === "analyzing" || phase === "sending") return;
    const generation = ++analysisGeneration.current;
    setPhase("analyzing");
    setMessage("無料AIモデルを準備しています…");
    try {
      const preparedPhoto = await sanitizeTrainingPhoto(file);
      const result = await analyzeFoodPhotoDetailed(preparedPhoto, (progress) => {
        if (analysisGeneration.current === generation) setMessage(progress.percent ? `${progress.label} ${progress.percent}%` : progress.label);
      });
      if (analysisGeneration.current !== generation) return;
      setCandidates(result.candidates);
      if (result.candidates[0]) selectCandidate(result.candidates[0]);
      setPhase("ready");
      setMessage(result.candidates.length ? "AIの候補は推測です。正しい料理名を確認してください。" : "候補が見つかりませんでした。料理名を入力してください。");
    } catch (error) {
      if (analysisGeneration.current !== generation) return;
      setPhase("error");
      setMessage(error instanceof Error && /この写真を|写真を送信用に/.test(error.message) ? error.message : "AIで解析できませんでした。再試行するか、料理名を入力して共有できます。");
    }
  }

  function enterManually() {
    // Model download/inference can finish later; its results must not overwrite
    // the user's manual label or restart the visible analysis state.
    analysisGeneration.current += 1;
    setCandidates([]);
    setSelectedId("");
    setCorrectName("");
    setLabelChecked(false);
    setNutrition(emptyNutrition);
    setConsent(false);
    setPhase("ready");
    setMessage("写真を確認して、正しい料理名を入力してください。");
  }

  async function sendCorrection() {
    const name = correctName.trim();
    if (!file || phase !== "ready" || !name || !labelChecked || !consent || !connection.ready) return;
    if (Object.values(nutrition).some((value) => !Number.isFinite(value) || value < 0 || value > 10000)) {
      setMessage("栄養値は0以上の数値で入力してください。");
      return;
    }
    const known = foodCatalog.find((item) => normalizedName(plainName(item.food.name)) === normalizedName(name));
    const confirmedFoodId = known?.id ?? `custom:${normalizedName(name)}`;
    const key = JSON.stringify([file.name, file.size, file.lastModified, candidates.map((item) => item.id), confirmedFoodId, name, nutrition]);
    if (!submission.current || submission.current.key !== key) {
      submission.current = { key, id: createId("food-photo"), createdAt: new Date().toISOString() };
    }
    const current = submission.current;
    setPhase("sending");
    setMessage("Google認証を確認しています…");
    try {
      const accessToken = await requestGoogleAccountToken(clientId);
      setMessage("EXIFを除いた写真と正解をfoodDBへ送信しています…");
      const receipt = await submitFoodCorrectionToSharedDrive({
        endpoint, accessToken, id: current.id, image: file,
        predictedFoodIds: candidates.map((item) => item.id), confirmedFoodId,
        confirmedFoodName: name, nutrition, createdAt: current.createdAt, consent: true,
        onProgress: setMessage,
      });
      setReceiptId(receipt.id);
      setPhase("sent");
      setMessage("foodDBへの保存を確認しました。確認後、独立評価に合格したデータだけを学習に利用します。");
    } catch (error) {
      setPhase("ready");
      setMessage(`送信を確認できませんでした。同じ内容なら再試行できます。${error instanceof Error ? error.message : "時間をおいて再試行してください。"}`);
    }
  }

  const busy = phase === "analyzing" || phase === "sending";
  return <div className="min-h-dvh bg-white text-[var(--ink)]">
    <header className="safe-top border-b border-[var(--line)]"><div className="mx-auto flex min-h-20 max-w-3xl items-center justify-between gap-3 safe-gutters"><Logo /><Link href="/login" className="text-link text-sm">記録アプリへ</Link></div></header>
    <main className="mx-auto max-w-3xl safe-gutters safe-bottom pb-16 pt-8 sm:pt-12">
      <p className="text-xs font-bold tracking-widest text-[var(--sage-deep)]">無料・アカウント不要で解析</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">食事写真AIを試す</h1>
      <p className="mt-4 text-sm leading-7 text-[var(--muted)]">写真を選ぶと、端末上のAIが料理候補を表示します。初回は約200MBの無料モデルをダウンロードします。判定が違えば正しい料理名を教えてください。学習用の共有は任意で、Google認証と同意をした時だけ送信します。</p>
      <section className="mt-7 rounded-md border border-[var(--line)] bg-[var(--sand)] p-4 text-xs leading-6 sm:p-5" aria-label="写真とデータの取り扱い"><p className="font-bold">写真の取り扱い</p><p className="mt-1">解析だけなら食事写真は送信されません。共有する場合は写真の位置情報などを除去し、料理名・AI候補・入力した栄養値と一緒に非公開のfoodDBへ保存します。人物や個人情報が写った写真は選ばないでください。</p></section>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-6 text-[var(--muted)]" aria-label="共有先の接続状態">
        <p role="status">{connection.ready ? "共有先に接続済み" : connection.checking ? "共有先を確認中… 通信が遅い場合は自動で再接続します。写真の選択は先に進められます。" : connection.error}</p>
        {!connection.ready && !connection.checking && <Button type="button" variant="secondary" disabled={busy} onClick={connection.retry}>再接続</Button>}
      </div>
      <details className="mt-3 rounded-md border border-[var(--line)] p-3 text-xs leading-6 text-[var(--muted)]">
        <summary className="min-h-11 cursor-pointer content-center font-semibold">Discord・LINEなどから開いた方／接続できない方へ</summary>
        <p>アプリ内の画面では認証や通信が制限される場合があります。右下のコンパス、共有メニュー、または「…」から「Safariで開く」「ブラウザで開く」を選んでください。AndroidはChromeで開いてください。</p>
        <p className="mt-2">切り替え先には写真・入力内容を引き継げません。切り替えてから写真を選び直してください。この画面の「再接続」なら写真・入力内容はそのままです。</p>
        <label className="mt-2 block">ブラウザに貼り付けるURL（長押しでコピー）<input aria-label="食事写真ページのURL" className="form-input mt-1 w-full" readOnly value="https://healthapp-14a3f.web.app/food-photo/" onFocus={(event) => event.currentTarget.select()} /></label>
        <p className="mt-2">Safari／Chromeでも接続できない場合はWi-Fiとモバイル通信を切り替えて「再接続」をお試しください。接続確認だけでは写真は送信されません。</p>
      </details>
      <section className="mt-8" aria-label="食事写真の解析">
        <h2 className="text-lg font-bold">1. 食事写真を選ぶ</h2>
        <div className="mt-4 flex items-start gap-4">
          {preview && <div className="relative size-28 shrink-0 overflow-hidden rounded-md border border-[var(--line)] bg-[var(--sand)]"><Image src={preview} alt="選んだ食事写真" fill unoptimized className="object-cover" /></div>}
          <div className="grid min-w-0 flex-1 gap-3">
            <label className="relative flex min-h-14 cursor-pointer items-center justify-center rounded-md border border-[var(--sage-deep)] bg-[var(--sage-soft)] px-3 text-center text-sm font-semibold text-[var(--sage-deep)] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--sage-deep)]">
              {file ? "別の写真をアルバムから選ぶ" : "写真をアルバムから選ぶ"}
              <input type="file" accept="image/*" className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label="写真をアルバムから選ぶ" disabled={busy} onChange={chooseFile} />
            </label>
            <label className="relative flex min-h-14 cursor-pointer items-center justify-center rounded-md border border-[var(--line)] px-3 text-center text-sm font-semibold text-[var(--ink)] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--sage-deep)]">
              カメラで撮影
              <input type="file" accept="image/*" capture="environment" className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label="カメラで撮影" disabled={busy} onChange={chooseFile} />
            </label>
          </div>
        </div>
        {file && phase !== "sent" && <Button type="button" className="mt-4 w-full" disabled={busy} onClick={() => void analyze()}>{phase === "analyzing" ? "解析中…" : "写真をAIで解析"}</Button>}
        {file && (phase === "idle" || phase === "error" || phase === "analyzing") && <Button type="button" variant="secondary" className="mt-3 w-full" onClick={enterManually}>{phase === "analyzing" ? "解析を待たずに料理名を入力" : "料理名を入力して共有する"}</Button>}
      </section>
      {(phase === "ready" || phase === "sending" || phase === "sent") && <section className="mt-10 border-t border-[var(--line)] pt-8" aria-label="AI候補と正解">
        <h2 className="text-lg font-bold">2. AIの候補と正解を確認</h2>
        <p className="mt-2 text-xs leading-6 text-[var(--muted)]">候補の確率・栄養値は目安です。写真だけでは量やPFCを正確に測れません。</p>
        <div className="mt-4 grid gap-2">{candidates.map((candidate) => <button type="button" key={candidate.id} disabled={busy || phase === "sent"} aria-pressed={selectedId === candidate.id} onClick={() => selectCandidate(candidate)} className={`min-h-14 rounded-md border px-4 py-3 text-left text-sm ${selectedId === candidate.id ? "border-[var(--sage-deep)] bg-[var(--sage-soft)]" : "border-[var(--line)]"}`}><span className="font-semibold">{plainName(candidate.food.name)}</span><span className="ml-2 text-xs text-[var(--muted)]">AI推測 {(candidate.modelScore * 100).toFixed(0)}%</span></button>)}</div>
        <label className="mt-5 block text-sm font-bold">正しい料理名<input className="form-input mt-2 w-full" value={correctName} disabled={busy || phase === "sent"} maxLength={100} placeholder="例：卵焼き" onChange={(event) => { setCorrectName(event.target.value); setSelectedId(""); setLabelChecked(false); }} /></label>
        <label className="mt-3 flex items-start gap-3 text-xs leading-6"><input type="checkbox" className="mt-1 size-5 shrink-0 accent-[var(--sage-deep)]" checked={labelChecked} disabled={busy || phase === "sent" || !correctName.trim()} onChange={(event) => setLabelChecked(event.target.checked)} /><span>写真を見て、上の料理名が主料理として正しいことを確認しました。AI候補を見ただけではチェックしないでください。</span></label>
        <fieldset className="mt-5"><legend className="text-sm font-bold">栄養値の目安（わかる範囲で修正）</legend><p className="mt-1 text-xs leading-6 text-[var(--muted)]">栄養値は利用者による目安として保存し、栄養の正解データとしては扱いません。</p><div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">{nutritionFields.map(([key, label, unit]) => <label key={key} className="text-xs font-medium">{label}（{unit}）<input className="form-input mt-2 w-full" type="number" min="0" max="10000" step="0.1" inputMode="decimal" value={nutrition[key]} disabled={busy || phase === "sent"} onChange={(event) => setNutrition((value) => ({ ...value, [key]: event.target.value === "" ? 0 : Number(event.target.value) }))} /></label>)}</div></fieldset>
        <div className="mt-8 rounded-md border border-[var(--line)] bg-[var(--sand)] p-4"><label className="flex cursor-pointer items-start gap-3 text-xs leading-6"><input type="checkbox" className="mt-1 size-5 shrink-0 accent-[var(--sage-deep)]" checked={consent} disabled={busy || phase === "sent"} onChange={(event) => setConsent(event.target.checked)} /><span>学習用データの共有に同意します。写真（EXIF除去後）、AI候補、正しい料理名、入力した栄養値を非公開foodDBへ送ります。氏名・メール・認証トークンは学習データに保存しません。送信データは確認待ちとなり、すぐにAIへ反映されるわけではありません。</span></label><Button type="button" className="mt-4 w-full" disabled={busy || phase === "sent" || !labelChecked || !consent || !correctName.trim() || !connection.ready} onClick={() => void sendCorrection()}>{phase === "sending" ? "送信中…" : phase === "sent" ? "共有済み" : connection.checking ? "共有先を確認中…" : "Googleで認証して正解を共有"}</Button>{connection.error && <p className="mt-2 text-xs leading-6 text-[var(--coral)]">共有先に接続できていません。ページ上部の「再接続」を押してください。</p>}</div>
      </section>}
      {message && <p role="status" className={`mt-5 break-words rounded-md p-3 text-sm leading-6 ${phase === "error" ? "bg-[var(--coral-soft)] text-[var(--coral)]" : "bg-[var(--sage-soft)]"}`}>{message}{receiptId && <span className="mt-1 block text-xs">削除依頼・問い合わせ用の受付番号: {receiptId}</span>}</p>}
      <p className="mt-5 text-xs leading-6 text-[var(--muted)]">写真・正解データは解析や送信のためにこの画面で扱い、個人の食事記録には保存しません。共有後に削除を希望する場合は受付番号をお知らせください。</p>
    </main>
  </div>;
}
