"use client";

import Image from "next/image";
import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { analyzeFoodPhotoDetailed, type FoodPhotoCandidate } from "@/lib/food-ai/food-photo-analyzer";
import { foodCatalog } from "@/lib/food-ai/food-catalog";
import { applyPhotoNutritionUplift, PHOTO_NUTRITION_UPLIFT } from "@/lib/food-ai/photo-nutrition-estimate";
import { isSupportedFoodPhoto, requestGoogleAccountToken, sanitizeTrainingPhoto, submitFoodCorrectionToSharedDrive } from "@/lib/drive/google-drive-client";
import { useGoogleDriveClientId, useTrainingConnection, useTrainingDataEndpoint } from "@/hooks/use-google-drive-client-id";
import { createId } from "@/lib/utils/id";
import type { MealFoodItem } from "@/types/meal";
import { portionGrams, scaleNutrition, suggestedGramsPerPiece, validPortion, type FoodPortionUnit } from "@/lib/food-portions";
import libraryJson from "@/lib/data/food-library.json";
import type { FoodLibraryDataset } from "@/types/food-database";
import { isSharedTestEnvironment } from "@/lib/cloud/config";

interface PhotoMealAnalyzerProps {
  onAddFood: (food: Omit<MealFoodItem, "id">) => Promise<void>;
}

type AnalyzeStatus = "idle" | "analyzing" | "complete" | "error";
type NutritionValues = { calories: number; proteinG: number; fatG: number; carbsG: number };
const emptyNutrition: NutritionValues = { calories: 0, proteinG: 0, fatG: 0, carbsG: 0 };
const library = libraryJson as FoodLibraryDataset;

function normalizeName(value: string): string {
  return value.trim().normalize("NFKC").replace(/[\s　]+/g, "").toLocaleLowerCase();
}

function plainFoodName(value: string): string {
  return value.replace(/（\d+(?:\.\d+)?g）$/, "");
}

function toNutritionValues(food: Partial<NutritionValues>): NutritionValues {
  return { calories: food.calories ?? 0, proteinG: food.proteinG ?? 0, fatG: food.fatG ?? 0, carbsG: food.carbsG ?? 0 };
}

export function PhotoMealAnalyzer({ onAddFood }: PhotoMealAnalyzerProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<FoodPhotoCandidate[]>([]);
  const [selectedFoodId, setSelectedFoodId] = useState("");
  const [confirmedFoodName, setConfirmedFoodName] = useState("");
  const [nutrition, setNutrition] = useState<NutritionValues>(emptyNutrition);
  const [amountUnit, setAmountUnit] = useState<FoodPortionUnit>("g");
  const [amountQuantity, setAmountQuantity] = useState(100);
  const [gramsPerPiece, setGramsPerPiece] = useState(100);
  const [status, setStatus] = useState<AnalyzeStatus>("idle");
  const [statusText, setStatusText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [shareConsent, setShareConsent] = useState(false);
  const [nutritionDrafts, setNutritionDrafts] = useState<Partial<Record<keyof NutritionValues, string>>>({});
  const submission = useRef<{ key: string; id: string; createdAt: string; added: boolean } | null>(null);
  const previewUrl = useRef<string | null>(null);
  const analysisGeneration = useRef(0);
  const driveClientId = useGoogleDriveClientId();
  const trainingEndpoint = useTrainingDataEndpoint();
  const connection = useTrainingConnection(driveClientId, trainingEndpoint);

  useEffect(() => () => { if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); }, []);

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0];
    event.target.value = "";
    if (!nextFile) return;
    if (!isSupportedFoodPhoto(nextFile)) {
      setStatusText("20MB以下の食事写真を選んでください。");
      return;
    }
    analysisGeneration.current += 1;
    setFile(nextFile);
    submission.current = null;
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = URL.createObjectURL(nextFile);
    setPreview(previewUrl.current);
    setCandidates([]);
    setSelectedFoodId("");
    setConfirmedFoodName("");
    setNutrition(emptyNutrition);
    setNutritionDrafts({});
    setAmountUnit("g");
    setAmountQuantity(100);
    setGramsPerPiece(100);
    setStatus("idle");
    setStatusText("");
    setShareConsent(false);
  }

  async function analyze() {
    if (!file || status === "analyzing" || isSaving) return;
    const generation = ++analysisGeneration.current;
    setStatus("analyzing");
    setStatusText("AIの準備をしています");
    try {
      const preparedPhoto = await sanitizeTrainingPhoto(file);
      const { candidates: nextCandidates } = await analyzeFoodPhotoDetailed(preparedPhoto, (progress) => { if (analysisGeneration.current === generation) setStatusText(progress.percent ? `${progress.label} ${progress.percent}%` : progress.label); });
      if (analysisGeneration.current !== generation) return;
      setCandidates(nextCandidates);
      setSelectedFoodId(nextCandidates[0]?.id ?? "");
      setConfirmedFoodName(nextCandidates[0] ? plainFoodName(nextCandidates[0].food.name) : "");
      if (nextCandidates[0]) selectCandidate(nextCandidates[0]);
      else { setNutrition(emptyNutrition); setNutritionDrafts({}); }
      setStatus("complete");
      setStatusText(nextCandidates.length ? "候補を確認し、正しい料理名と数値に直してください。" : "候補を見つけられませんでした。料理名を入力してください。");
    } catch (error) {
      if (analysisGeneration.current !== generation) return;
      setStatus("error");
      setStatusText(error instanceof Error && /この写真を|写真を送信用に/.test(error.message) ? error.message : "AIで解析できませんでした。再試行するか、料理名を入力して続けられます。");
    }
  }

  function enterManually() {
    analysisGeneration.current += 1;
    setCandidates([]);
    setSelectedFoodId("");
    setConfirmedFoodName("");
    setNutrition(emptyNutrition);
    setNutritionDrafts({});
    setShareConsent(false);
    setStatus("complete");
    setStatusText("写真を確認して、正しい料理名を入力してください。");
  }

  function selectCandidate(candidate: FoodPhotoCandidate) {
    setSelectedFoodId(candidate.id);
    setConfirmedFoodName(plainFoodName(candidate.food.name));
    setNutrition(toNutritionValues(applyPhotoNutritionUplift(candidate.food)));
    setNutritionDrafts({});
    const source = library.foods.find((food) => food.id === candidate.id);
    const baseGrams = candidate.food.portionGrams ?? 100;
    const pieceGrams = suggestedGramsPerPiece(candidate.id, candidate.food.name, source?.suggestedGrams ?? baseGrams);
    setAmountUnit(pieceGrams ? "個" : "g");
    setAmountQuantity(pieceGrams ? 1 : baseGrams);
    setGramsPerPiece(pieceGrams ?? baseGrams);
  }

  function changePortion(unit: FoodPortionUnit, quantity: number, pieceGrams: number) {
    setAmountUnit(unit);
    setAmountQuantity(quantity);
    setGramsPerPiece(pieceGrams);
    const candidate = candidates.find((item) => item.id === selectedFoodId);
    if (!candidate || !validPortion(quantity, unit, pieceGrams)) return;
    const factor = portionGrams(quantity, unit, pieceGrams) / (candidate.food.portionGrams ?? 100);
    setNutrition(toNutritionValues(applyPhotoNutritionUplift(scaleNutrition(candidate.food, factor))));
    setNutritionDrafts({});
  }

  async function addConfirmedFood(shareTrainingData: boolean) {
    if (shareTrainingData && isSharedTestEnvironment) return;
    const name = confirmedFoodName.trim();
    if (!file || !name || isSaving || !validPortion(amountQuantity, amountUnit, gramsPerPiece)) return;
    if (shareTrainingData && (!shareConsent || !connection.ready)) return;
    if (Object.values(nutrition).some((value) => !Number.isFinite(value) || value < 0 || value > 10000)) {
      setStatusText("栄養値は0以上10,000以下の数値で入力してください。");
      return;
    }
    const matchingFood = foodCatalog.find((item) => normalizeName(plainFoodName(item.food.name)) === normalizeName(name));
    const confirmedFoodId = matchingFood?.id ?? `custom:${normalizeName(name)}`;
    const key = JSON.stringify([candidates.map((candidate) => candidate.id), confirmedFoodId, name, nutrition, amountQuantity, amountUnit, gramsPerPiece]);
    if (!submission.current || submission.current.key !== key) {
      submission.current = { key, id: createId("food-photo"), createdAt: new Date().toISOString(), added: false };
    }
    const currentSubmission = submission.current;
    const { id, createdAt } = currentSubmission;
    setIsSaving(true);
    setStatusText(shareTrainingData ? "Googleログインを確認しています…" : "食事を記録しています…");
    let accessToken: string | null = null;
    let driveSaved = false;
    try {
      if (shareTrainingData) accessToken = await requestGoogleAccountToken(driveClientId);

      let saveStatus = "学習用の写真・正解データは端末へ保存しません。";
      if (shareTrainingData && accessToken) {
        try {
          const receipt = await submitFoodCorrectionToSharedDrive({ endpoint: trainingEndpoint, accessToken, id, image: file, predictedFoodIds: candidates.map((candidate) => candidate.id), confirmedFoodId, confirmedFoodName: name, nutrition, createdAt, consent: true, onProgress: setStatusText });
          driveSaved = true;
          saveStatus = `foodDBへの写真と正解の保存完了を確認しました。削除依頼用受付番号：${receipt.id}（学習・精度向上の確認はこれからです）`;
        } catch (error) {
          saveStatus = `共有Driveへの送信には失敗しました: ${error instanceof Error ? error.message : "設定を確認してください。"}`;
        }
      }

      const estimatedGrams = portionGrams(amountQuantity, amountUnit, gramsPerPiece);
      if (!currentSubmission.added) {
        await onAddFood({ name: `${name}（${amountUnit === "個" ? `${amountQuantity}個・約${estimatedGrams}g` : `${estimatedGrams}g`}）`, ...nutrition, portionGrams: estimatedGrams, portionUnit: amountUnit, portionQuantity: amountQuantity, ...(amountUnit === "個" ? { gramsPerPiece } : {}) });
        currentSubmission.added = true;
      }
      setStatusText(`${name}を食事に保存しました。${saveStatus}`);
    } catch (error) {
      if (driveSaved) setStatusText(`学習データはDriveに保存済みですが、食事への追加に失敗しました。もう一度追加してください。${error instanceof Error ? error.message : ""}`);
      else if (shareTrainingData) setStatusText(`正解データの保存が完了せず、共有を中止しました。${error instanceof Error ? error.message : "共有せず追加を選ぶこともできます。"}`);
      else setStatusText("食事を保存できませんでした。保存先への接続を確認して、もう一度お試しください。");
    } finally {
      setIsSaving(false);
    }
  }

  const nutritionFields: Array<[keyof NutritionValues, string, string]> = [
    ["calories", "カロリー", "kcal"],
    ["proteinG", "タンパク質", "g"],
    ["fatG", "脂質", "g"],
    ["carbsG", "炭水化物", "g"],
  ];

  return <section className="mt-5 border-y border-[var(--line)] py-5">
    <div><h3 className="text-sm font-bold text-[var(--ink)]">写真からメニューを追加</h3><p className="mt-2 text-sm leading-6 text-[var(--muted)]">写真は端末内で解析します。候補が違う場合は、料理名と栄養値を修正できます。</p><p className="mt-3 rounded-md bg-[var(--sand)] px-3 py-3 text-xs leading-6 text-[var(--ink-soft)]">初期の推定値はカロリーだけ{Math.round(PHOTO_NUTRITION_UPLIFT * 100)}%上乗せします。PFCは上乗せしません。実際の量に合わせて修正してください。</p></div>
    <div className="mt-4 flex items-stretch gap-3">
      {preview ? <div className="relative size-24 shrink-0 overflow-hidden rounded-md bg-[var(--sand)]"><Image src={preview} alt="食事写真のプレビュー" fill unoptimized className="object-cover" /></div> : null}
      <div className="grid min-w-0 flex-1 gap-2">
        <label className="relative flex min-h-12 cursor-pointer items-center justify-center rounded-md border border-[var(--sage-deep)] bg-[var(--sage-soft)] px-3 text-center text-sm font-semibold text-[var(--sage-deep)] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--sage-deep)]">
          {preview ? "別の写真をアルバムから選ぶ" : "写真をアルバムから選ぶ"}
          <input type="file" accept="image/*" aria-label="写真をアルバムから選ぶ" className="absolute inset-0 h-full w-full cursor-pointer opacity-0" disabled={isSaving || status === "analyzing"} onChange={(event) => void handleFile(event)} />
        </label>
        <label className="relative flex min-h-12 cursor-pointer items-center justify-center rounded-md border border-[var(--line)] bg-white px-3 text-center text-sm font-semibold text-[var(--ink)] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--sage-deep)]">
          <Icon name="camera" className="mr-2 size-5 text-[var(--sage-deep)]" />カメラで撮影
          <input type="file" accept="image/*" capture="environment" aria-label="カメラで撮影" className="absolute inset-0 h-full w-full cursor-pointer opacity-0" disabled={isSaving || status === "analyzing"} onChange={(event) => void handleFile(event)} />
        </label>
      </div>
    </div>
    {file && status !== "complete" ? <Button type="button" className="mt-3 w-full px-3 py-3 leading-6" onClick={() => void analyze()} disabled={status === "analyzing"}>{status === "analyzing" ? statusText : "写真をAIで解析"}</Button> : null}
    {file && (status === "idle" || status === "error" || status === "analyzing") && <Button type="button" variant="secondary" className="mt-3 w-full" onClick={enterManually}>{status === "analyzing" ? "解析を待たずに料理名を入力" : "料理名を入力して続ける"}</Button>}
    {status === "complete" ? <div className="mt-4">
      <p className="text-xs font-bold text-[var(--sage-deep)]">AIの候補（カロリーのみ上振れ補正）</p>
      {candidates.length ? <div className="mt-2 space-y-2">{candidates.map((candidate) => { const estimate = applyPhotoNutritionUplift(candidate.food); return <button key={candidate.id} type="button" onClick={() => selectCandidate(candidate)} aria-pressed={selectedFoodId === candidate.id} className={`flex w-full items-start gap-3 rounded-md border p-3 text-left transition ${selectedFoodId === candidate.id ? "border-[var(--sage-deep)] bg-[var(--sage-soft)]" : "border-[var(--line)] bg-white"}`}><span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border ${selectedFoodId === candidate.id ? "border-[var(--sage-deep)] bg-[var(--sage-deep)] text-white" : "border-[#cdd3cf]"}`}>{selectedFoodId === candidate.id ? <Icon name="check" className="size-3.5" /> : null}</span><span className="min-w-0 flex-1"><span className="block break-words text-sm font-bold leading-6 text-[var(--ink)]">{candidate.food.name}</span><span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs leading-5 text-[var(--muted)]"><span className="font-semibold text-[var(--ink)]">{estimate.calories} kcal</span><span>推定 {(candidate.modelScore * 100).toFixed(0)}%</span></span><span className="metric mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs leading-5 text-[var(--muted)]"><span>P {estimate.proteinG}g</span><span>F {estimate.fatG}g</span><span>C {estimate.carbsG}g</span></span></span></button>; })}</div> : <p className="mt-2 text-xs text-[var(--muted)]">候補なし。料理名を入力して登録できます。</p>}
      <label className="mt-4 block text-xs font-bold text-[var(--ink)]">正しい料理名<input value={confirmedFoodName} onChange={(event) => setConfirmedFoodName(event.target.value)} placeholder="例：鶏むね肉の照り焼き" className="mt-2 h-12 w-full rounded border border-[var(--line)] bg-white px-3 text-base font-medium outline-none focus:border-[var(--sage-deep)]" /></label>
      <div className="mt-4"><p className="text-xs font-bold text-[var(--ink)]">食べた量</p><div className="mt-2 flex gap-2" role="group" aria-label="写真から登録する量の単位">{(["g", "個"] as const).map((value) => <button key={value} type="button" aria-pressed={amountUnit === value} onClick={() => changePortion(value, value === "g" ? portionGrams(amountQuantity, amountUnit, gramsPerPiece) : 1, gramsPerPiece)} className={`min-h-11 min-w-16 rounded border px-3 text-sm font-bold ${amountUnit === value ? "border-[var(--sage-deep)] bg-[var(--sage-soft)] text-[var(--sage-deep)]" : "border-[var(--line)] bg-white text-[var(--muted)]"}`}>{value}</button>)}</div><div className="mt-2 flex items-center gap-2"><input aria-label="写真から登録する食べた量" type="number" min="1" max={amountUnit === "g" ? "3000" : "100"} step="1" inputMode="numeric" value={amountQuantity || ""} onChange={(event) => changePortion(amountUnit, event.target.value === "" ? 0 : Number(event.target.value), gramsPerPiece)} className="form-input max-w-40" /><span className="text-sm text-[var(--muted)]">{amountUnit}</span></div>{amountUnit === "個" && <label className="mt-3 block text-xs font-medium text-[var(--ink)]">1個あたりの可食部（目安・変更可）<span className="mt-2 flex items-center gap-2"><input aria-label="写真の食品1個あたりの重さ" type="number" min="1" max="3000" step="1" inputMode="numeric" value={gramsPerPiece || ""} onChange={(event) => changePortion(amountUnit, amountQuantity, event.target.value === "" ? 0 : Number(event.target.value))} className="form-input max-w-40" /><span>g</span></span></label>}<p className="mt-2 text-xs text-[var(--muted)]">{amountUnit === "個" ? `${amountQuantity}個 ≒ ${portionGrams(amountQuantity, amountUnit, gramsPerPiece)}g。個体差があるため目安です。` : "量を変更すると初期推定値を再計算します。最後に栄養値を確認してください。"}</p>{!validPortion(amountQuantity, amountUnit, gramsPerPiece) && <p className="mt-2 text-xs text-[var(--coral)]">量と1個あたりの重さを確認してください（合計3,000gまで）。</p>}</div>
      <fieldset className="mt-4"><legend className="text-xs font-bold leading-6 text-[var(--ink)]">食事に記録する栄養値（修正できます）</legend><div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">{nutritionFields.map(([key, label, unit]) => <label key={key} className="min-w-0 text-xs font-medium text-[var(--muted)]">{label}（{unit}）<input type="number" min="0" step="1" inputMode="decimal" placeholder="0" value={nutritionDrafts[key] ?? (nutrition[key] === 0 ? "" : nutrition[key])} onChange={(event) => { const draft = event.target.value; setNutritionDrafts((current) => ({ ...current, [key]: draft })); setNutrition((current) => ({ ...current, [key]: draft === "" ? 0 : Number(draft) })); }} className="mt-2 h-12 w-full min-w-0 rounded border border-[var(--line)] bg-white px-3 text-base font-medium text-[var(--ink)] outline-none focus:border-[var(--sage-deep)]" /></label>)}</div></fieldset>
      {isSharedTestEnvironment ? <p className="mt-5 rounded-md bg-[var(--sand)] p-3 text-xs leading-6">テスト環境では学習データの共有を行いません。食事の内容はテスト用アカウントに保存できます。</p> : <div className="mt-5 rounded-md border border-[var(--line)] bg-[var(--sand)] p-3 sm:p-4">
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-xs leading-6 text-[var(--ink-soft)]"><input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[var(--sage-deep)]" checked={shareConsent} disabled={isSaving} onChange={(event) => setShareConsent(event.target.checked)} /><span>学習データへの提供に同意します。写真（位置情報等のEXIFを除去したもの）、AI候補、修正した料理名・栄養値がBodyMake共通Driveに保存され、今後の認識モデル改善用データとして利用されます。氏名・メールアドレスは学習データに保存しません。</span></label>
        <Button type="button" className="mt-3 w-full px-3 py-3 leading-6" onClick={() => void addConfirmedFood(true)} disabled={!confirmedFoodName.trim() || isSaving || !validPortion(amountQuantity, amountUnit, gramsPerPiece) || !shareConsent || !connection.ready}>{isSaving ? "処理中…" : connection.checking ? "共有先を確認中…" : "食事に保存してGoogleで正解データを共有"}</Button>
        {connection.error && <div className="mt-3 text-xs leading-6 text-[var(--coral)]"><p>{connection.error}</p><Button type="button" variant="secondary" className="mt-2 w-full" disabled={isSaving} onClick={connection.retry}>再接続</Button></div>}
      </div>}
      <Button type="button" variant="secondary" className="mt-2 w-full" onClick={() => void addConfirmedFood(false)} disabled={!confirmedFoodName.trim() || isSaving || !validPortion(amountQuantity, amountUnit, gramsPerPiece)}>{isSaving ? "処理中…" : isSharedTestEnvironment ? "テスト用の食事に追加して保存" : "共有せず食事に追加して保存"}</Button>
    </div> : null}
    {statusText && status !== "analyzing" ? <p role="status" className={`mt-3 break-words text-sm leading-6 ${status === "error" ? "text-[var(--coral)]" : "text-[var(--muted)]"}`}>{statusText}</p> : null}
    <p className="mt-4 text-xs leading-6 text-[var(--muted)]">{isSharedTestEnvironment ? "写真は解析のためにメモリ内だけで扱い、共有Driveへ送信しません。" : "学習用の写真・正解はこの端末へ新しく保存しません。共有にはGoogle認証と明示的な同意が必要です。送信失敗時は同じ内容で再送できます。認証情報は保存しません。"}</p>
  </section>;
}
