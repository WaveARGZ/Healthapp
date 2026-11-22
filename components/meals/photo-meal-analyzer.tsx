"use client";

import Image from "next/image";
import Link from "next/link";
import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { analyzeFoodPhotoDetailed, type FoodPhotoCandidate } from "@/lib/food-ai/food-photo-analyzer";
import { applyPhotoNutritionUplift, PHOTO_NUTRITION_UPLIFT } from "@/lib/food-ai/photo-nutrition-estimate";
import { isSupportedFoodPhoto, sanitizeTrainingPhoto } from "@/lib/drive/google-drive-client";
import type { MealEntry, MealFoodItem } from "@/types/meal";
import { portionGrams, scaleNutrition, suggestedGramsPerPiece, validPortion, type FoodPortionUnit } from "@/lib/food-portions";
import libraryJson from "@/lib/data/food-library.json";
import type { FoodLibraryDataset } from "@/types/food-database";
import { isSharedTestEnvironment } from "@/lib/cloud/config";
import { photoDishName } from "@/lib/food-ai/photo-history";

interface PhotoMealAnalyzerProps {
  onAddFood: (food: Omit<MealFoodItem, "id">) => Promise<void>;
  previousMeals?: readonly MealEntry[];
  historyLoading?: boolean;
}

type AnalyzeStatus = "idle" | "analyzing" | "complete" | "error";
type NutritionValues = { calories: number; proteinG: number; fatG: number; carbsG: number };
const emptyNutrition: Partial<NutritionValues> = {};
const library = libraryJson as FoodLibraryDataset;

function candidateFood(candidate: FoodPhotoCandidate, factor = 1): Omit<MealFoodItem, "id"> {
  const food = factor === 1 ? candidate.food : scaleNutrition(candidate.food, factor);
  return candidate.origin === "history" ? food : applyPhotoNutritionUplift(food);
}

function toNutritionValues(food: Partial<NutritionValues>): Partial<NutritionValues> {
  const values: Partial<NutritionValues> = {};
  for (const key of ["calories", "proteinG", "fatG", "carbsG"] as const) if (food[key] !== undefined) values[key] = food[key];
  return values;
}

export function PhotoMealAnalyzer({ onAddFood, previousMeals = [], historyLoading = false }: PhotoMealAnalyzerProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<FoodPhotoCandidate[]>([]);
  const [selectedFoodId, setSelectedFoodId] = useState("");
  const [confirmedFoodName, setConfirmedFoodName] = useState("");
  const [nutrition, setNutrition] = useState<Partial<NutritionValues>>(emptyNutrition);
  const [amountUnit, setAmountUnit] = useState<FoodPortionUnit>("g");
  const [amountQuantity, setAmountQuantity] = useState(100);
  const [gramsPerPiece, setGramsPerPiece] = useState(100);
  const [status, setStatus] = useState<AnalyzeStatus>("idle");
  const [statusText, setStatusText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [savedMeal, setSavedMeal] = useState(false);
  const [nutritionDrafts, setNutritionDrafts] = useState<Partial<Record<keyof NutritionValues, string>>>({});
  const submission = useRef<{ key: string; added: boolean } | null>(null);
  const previewUrl = useRef<string | null>(null);
  const analysisGeneration = useRef(0);

  useEffect(() => () => {
    analysisGeneration.current += 1;
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
  }, []);

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
    setSavedMeal(false);
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
  }

  async function analyze() {
    if (!file || status === "analyzing" || isSaving || historyLoading) return;
    const generation = ++analysisGeneration.current;
    setStatus("analyzing");
    setStatusText("AIの準備をしています");
    try {
      const preparedPhoto = await sanitizeTrainingPhoto(file);
      const result = await analyzeFoodPhotoDetailed(preparedPhoto, (progress) => { if (analysisGeneration.current === generation) setStatusText(progress.percent ? `${progress.label} ${progress.percent}%` : progress.label); }, { previousMeals });
      if (analysisGeneration.current !== generation) return;
      const nextCandidates = [...result.candidates, ...(result.historyCandidates ?? [])];
      const recommended = nextCandidates.find((candidate) => candidate.id === result.recommendedCandidateId) ?? nextCandidates[0];
      if (recommended?.origin === "history") nextCandidates.sort((a, b) => Number(b.id === recommended.id) - Number(a.id === recommended.id));
      setCandidates(nextCandidates);
      setSelectedFoodId(recommended?.id ?? "");
      setConfirmedFoodName(recommended ? photoDishName(recommended.food.name) : "");
      if (recommended) selectCandidate(recommended);
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
    setStatus("complete");
    setStatusText("写真を確認して、正しい料理名を入力してください。");
  }

  function selectCandidate(candidate: FoodPhotoCandidate) {
    setSelectedFoodId(candidate.id);
    setConfirmedFoodName(photoDishName(candidate.food.name));
    setNutrition(toNutritionValues(candidateFood(candidate)));
    setNutritionDrafts({});
    const source = library.foods.find((food) => food.id === candidate.id);
    const baseGrams = candidate.food.portionGrams ?? 100;
    const pieceGrams = candidate.origin === "history" ? null : suggestedGramsPerPiece(candidate.id, candidate.food.name, source?.suggestedGrams ?? baseGrams);
    setAmountUnit(pieceGrams ? "個" : "g");
    setAmountQuantity(candidate.origin === "history" && candidate.food.portionGrams === undefined ? 0 : pieceGrams ? 1 : baseGrams);
    setGramsPerPiece(pieceGrams ?? (candidate.origin === "history" ? 0 : baseGrams));
  }

  function changePortion(unit: FoodPortionUnit, quantity: number, pieceGrams: number) {
    setAmountUnit(unit);
    setAmountQuantity(quantity);
    setGramsPerPiece(pieceGrams);
    const candidate = candidates.find((item) => item.id === selectedFoodId);
    if (!candidate || !validPortion(quantity, unit, pieceGrams)) return;
    if (candidate.origin === "history" && candidate.food.portionGrams === undefined) return;
    const factor = portionGrams(quantity, unit, pieceGrams) / (candidate.food.portionGrams ?? 100);
    setNutrition(toNutritionValues(candidateFood(candidate, factor)));
    setNutritionDrafts({});
  }

  function clearNutrition() {
    setSelectedFoodId("");
    setNutrition({});
    setNutritionDrafts({});
    setStatusText("カロリーとPFCを空欄にしました。分かる数値だけ入力して保存できます。");
  }

  async function addConfirmedFood() {
    const name = confirmedFoodName.trim();
    if (!file || !name || isSaving || !validPortion(amountQuantity, amountUnit, gramsPerPiece)) return;
    if (Object.values(nutrition).some((value) => value !== undefined && (!Number.isFinite(value) || value < 0 || value > 10000))) {
      setStatusText("栄養値は0以上10,000以下の数値で入力してください。");
      return;
    }
    const key = JSON.stringify([candidates.map((candidate) => candidate.id), name, nutrition, amountQuantity, amountUnit, gramsPerPiece]);
    if (!submission.current || submission.current.key !== key) {
      submission.current = { key, added: false };
    }
    const currentSubmission = submission.current;
    setIsSaving(true);
    setStatusText("食事を記録しています…");
    try {
      const estimatedGrams = portionGrams(amountQuantity, amountUnit, gramsPerPiece);
      if (!currentSubmission.added) {
        await onAddFood({ name: `${name}（${amountUnit === "個" ? `${amountQuantity}個・約${estimatedGrams}g` : `${estimatedGrams}g`}）`, ...nutrition, portionGrams: estimatedGrams, portionUnit: amountUnit, portionQuantity: amountQuantity, ...(amountUnit === "個" ? { gramsPerPiece } : {}) });
        currentSubmission.added = true;
      }
      analysisGeneration.current += 1;
      setFile(null);
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = null;
      setPreview(null);
      setCandidates([]);
      setStatus("idle");
      setSavedMeal(true);
      setStatusText(`${name}を食事に保存しました。写真は保存していません。`);
    } catch {
      setStatusText("食事を保存できませんでした。保存先への接続を確認して、もう一度お試しください。");
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

  return <section className="mt-5 rounded-lg border border-[var(--line)] bg-[var(--sand)] p-4 sm:p-5">
    <div><h3 className="text-sm font-bold text-[var(--ink)]">写真から追加</h3><p className="mt-2 text-sm leading-6 text-[var(--muted)]">写真は端末内で解析します。料理名・栄養値は修正できます。</p><p className="mt-2 text-sm leading-6 text-[var(--muted)]">最近登録した料理も、最大20種類まで写真と比較します。</p><p className="mt-2 text-sm leading-6 text-[var(--muted)]">カロリーは推定値に{Math.round(PHOTO_NUTRITION_UPLIFT * 100)}%加算しています。PFCは補正せず、実際の量に合わせて修正できます。</p></div>
    <div className="mt-4 flex items-stretch gap-3">
      {preview ? <div className="relative size-24 shrink-0 overflow-hidden rounded-md bg-[var(--sand)]"><Image src={preview} alt="食事写真のプレビュー" fill unoptimized className="object-cover" /></div> : null}
      <div className="grid min-w-0 flex-1 gap-2">
        <label className="relative flex min-h-12 cursor-pointer items-center justify-center rounded-lg border border-[var(--sage-deep)] bg-[var(--sage-soft)] px-3 text-center text-sm font-semibold text-[var(--sage-deep)] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--sage-deep)]">
          {preview ? "別の写真をアルバムから選ぶ" : "写真をアルバムから選ぶ"}
          <input type="file" accept="image/*" aria-label="写真をアルバムから選ぶ" className="absolute inset-0 h-full w-full cursor-pointer opacity-0" disabled={isSaving || status === "analyzing"} onChange={(event) => void handleFile(event)} />
        </label>
        <label className="relative flex min-h-12 cursor-pointer items-center justify-center rounded-lg border border-[var(--line)] bg-white px-3 text-center text-sm font-semibold text-[var(--ink)] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--sage-deep)]">
          <Icon name="camera" className="mr-2 size-5 text-[var(--sage-deep)]" />カメラで撮影
          <input type="file" accept="image/*" capture="environment" aria-label="カメラで撮影" className="absolute inset-0 h-full w-full cursor-pointer opacity-0" disabled={isSaving || status === "analyzing"} onChange={(event) => void handleFile(event)} />
        </label>
      </div>
    </div>
    {historyLoading && <p className="mt-3 text-xs text-[var(--muted)]">以前登録した料理を読み込んでいます…</p>}
    {file && status !== "complete" ? <Button type="button" className="mt-3 w-full px-3 py-3 leading-6" onClick={() => void analyze()} disabled={status === "analyzing" || historyLoading}>{status === "analyzing" ? statusText : "写真をAIで解析"}</Button> : null}
    {file && (status === "idle" || status === "error" || status === "analyzing") && <Button type="button" variant="secondary" className="mt-3 w-full" onClick={enterManually}>{status === "analyzing" ? "解析を待たずに料理名を入力" : "料理名を入力して続ける"}</Button>}
    {status === "complete" ? <div className="mt-4">
      <p className="text-xs font-bold text-[var(--sage-deep)]">料理の候補</p>
      {candidates.length ? <div className="mt-2 space-y-2">{candidates.map((candidate) => { const estimate = candidateFood(candidate); return <button key={candidate.id} type="button" onClick={() => selectCandidate(candidate)} aria-pressed={selectedFoodId === candidate.id} className={`flex min-h-14 w-full items-start gap-3 rounded-lg border p-3 text-left transition ${selectedFoodId === candidate.id ? "border-[var(--sage-deep)] bg-[var(--sage-soft)]" : "border-[var(--line)] bg-white"}`}><span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border ${selectedFoodId === candidate.id ? "border-[var(--sage-deep)] bg-[var(--sage-deep)] text-white" : "border-[#cdd3cf]"}`}>{selectedFoodId === candidate.id ? <Icon name="check" className="size-3.5" /> : null}</span><span className="min-w-0 flex-1"><span className="block break-words text-sm font-bold leading-6 text-[var(--ink)]">{candidate.food.name}</span>{candidate.origin === "history" && <span className="mt-1 block text-xs text-[var(--sage-deep)]">前に登録した料理</span>}<span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs leading-5 text-[var(--muted)]"><span className="font-semibold text-[var(--ink)]">{estimate.calories ?? "—"} kcal</span>{candidate.origin !== "history" && <span>推定 {(candidate.modelScore * 100).toFixed(0)}%</span>}</span><span className="metric mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs leading-5 text-[var(--muted)]"><span>P {estimate.proteinG ?? "—"}g</span><span>F {estimate.fatG ?? "—"}g</span><span>C {estimate.carbsG ?? "—"}g</span></span></span></button>; })}</div> : <p className="mt-2 text-xs text-[var(--muted)]">候補なし。料理名を入力して登録できます。</p>}
      {candidates.some((candidate) => candidate.origin === "history") && <p className="mt-3 text-xs leading-6 text-[var(--muted)]">以前の料理名も写真と比較しています。前に登録した料理の栄養値は前回の入力値です。今回の量と数値を確認してください。</p>}
      <label className="mt-4 block text-xs font-bold text-[var(--ink)]">正しい料理名<input value={confirmedFoodName} onChange={(event) => setConfirmedFoodName(event.target.value)} placeholder="例：鶏むね肉の照り焼き" className="mt-2 h-12 w-full rounded border border-[var(--line)] bg-white px-3 text-base font-medium outline-none focus:border-[var(--sage-deep)]" /></label>
      <div className="mt-4"><p className="text-xs font-bold text-[var(--ink)]">食べた量</p><div className="mt-2 flex gap-2" role="group" aria-label="写真から登録する量の単位">{(["g", "個"] as const).map((value) => <button key={value} type="button" aria-pressed={amountUnit === value} onClick={() => changePortion(value, value === "g" ? portionGrams(amountQuantity, amountUnit, gramsPerPiece) : 1, gramsPerPiece)} className={`min-h-11 min-w-16 rounded border px-3 text-sm font-bold ${amountUnit === value ? "border-[var(--sage-deep)] bg-[var(--sage-soft)] text-[var(--sage-deep)]" : "border-[var(--line)] bg-white text-[var(--muted)]"}`}>{value}</button>)}</div><div className="mt-2 flex items-center gap-2"><input aria-label="写真から登録する食べた量" type="number" min="1" max={amountUnit === "g" ? "3000" : "100"} step="1" inputMode="numeric" value={amountQuantity || ""} onChange={(event) => changePortion(amountUnit, event.target.value === "" ? 0 : Number(event.target.value), gramsPerPiece)} className="form-input max-w-40" /><span className="text-sm text-[var(--muted)]">{amountUnit}</span></div>{amountUnit === "個" && <label className="mt-3 block text-xs font-medium text-[var(--ink)]">1個あたりの可食部（目安・変更可）<span className="mt-2 flex items-center gap-2"><input aria-label="写真の食品1個あたりの重さ" type="number" min="1" max="3000" step="1" inputMode="numeric" value={gramsPerPiece || ""} onChange={(event) => changePortion(amountUnit, amountQuantity, event.target.value === "" ? 0 : Number(event.target.value))} className="form-input max-w-40" /><span>g</span></span></label>}<p className="mt-2 text-xs text-[var(--muted)]">{amountUnit === "個" ? `${amountQuantity}個 ≒ ${portionGrams(amountQuantity, amountUnit, gramsPerPiece)}g。個体差があるため目安です。` : "量を変更すると初期推定値を再計算します。最後に栄養値を確認してください。"}</p>{!validPortion(amountQuantity, amountUnit, gramsPerPiece) && <p className="mt-2 text-xs text-[var(--coral)]">量と1個あたりの重さを確認してください（合計3,000gまで）。</p>}</div>
      <fieldset className="mt-4"><legend className="text-xs font-bold leading-6 text-[var(--ink)]">食事に記録する栄養値（修正できます）</legend><div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">{nutritionFields.map(([key, label, unit]) => <label key={key} className="min-w-0 text-xs font-medium text-[var(--muted)]">{label}（{unit}）<input type="number" min="0" step="1" inputMode="decimal" placeholder="未入力" value={nutritionDrafts[key] ?? nutrition[key] ?? ""} onChange={(event) => { const draft = event.target.value; setNutritionDrafts((current) => ({ ...current, [key]: draft })); setNutrition((current) => ({ ...current, [key]: draft === "" ? undefined : Number(draft) })); setStatusText(""); }} className="mt-2 h-12 w-full min-w-0 rounded border border-[var(--line)] bg-white px-3 text-base font-medium text-[var(--ink)] outline-none focus:border-[var(--sage-deep)]" /></label>)}</div><button type="button" onClick={clearNutrition} disabled={isSaving} className="mt-3 min-h-11 rounded-lg border border-[var(--line)] bg-white px-4 text-xs font-semibold text-[var(--sage-deep)] hover:bg-[var(--sage-soft)] disabled:opacity-50">カロリー・PFCを一括クリア</button><p className="mt-1 text-xs leading-5 text-[var(--muted)]">空欄は未入力として保存し、合計には含めません。</p></fieldset>
      <Button type="button" className="mt-5 w-full" onClick={() => void addConfirmedFood()} disabled={!confirmedFoodName.trim() || isSaving || !validPortion(amountQuantity, amountUnit, gramsPerPiece)}>{isSaving ? "処理中…" : "食事に追加して保存"}</Button>
    </div> : null}
    {statusText && status !== "analyzing" ? <p role="status" className={`mt-3 break-words text-sm leading-6 ${status === "error" ? "text-[var(--coral)]" : "text-[var(--muted)]"}`}>{statusText}</p> : null}
    {savedMeal && !isSharedTestEnvironment && <div className="mt-4 rounded-lg border border-[var(--line)] bg-white p-3">
      <Link href="/food-photo/" className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--sage-deep)]">写真認識の改善に協力する（任意）</Link>
      <p className="mt-1 text-xs leading-6 text-[var(--muted)]">共有画面で写真を選び直し、料理名と共有への同意を確認して送信できます。確認と独立した評価を通過したデータだけを学習に使います。</p>
    </div>}
    <p className="mt-4 text-xs leading-6 text-[var(--muted)]">写真は入力中だけメモリで扱い、記録後に破棄します。食事記録・共有Driveには保存しません。</p>
  </section>;
}
