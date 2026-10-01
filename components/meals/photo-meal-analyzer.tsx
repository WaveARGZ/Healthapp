"use client";

import Image from "next/image";
import { ChangeEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { analyzeFoodPhoto, type FoodPhotoCandidate } from "@/lib/food-ai/food-photo-analyzer";
import { findFoodById, foodCatalog } from "@/lib/food-ai/food-catalog";
import { recordFoodPhotoTrainingSample } from "@/lib/food-ai/food-learning";
import { createId } from "@/lib/utils/id";
import type { MealFoodItem } from "@/types/meal";

interface PhotoMealAnalyzerProps {
  onAddFood: (food: Omit<MealFoodItem, "id">) => void;
}

type AnalyzeStatus = "idle" | "analyzing" | "complete" | "error";

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function PhotoMealAnalyzer({ onAddFood }: PhotoMealAnalyzerProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<FoodPhotoCandidate[]>([]);
  const [selectedFoodId, setSelectedFoodId] = useState("");
  const [status, setStatus] = useState<AnalyzeStatus>("idle");
  const [statusText, setStatusText] = useState("");

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0];
    if (!nextFile) return;
    setFile(nextFile);
    setPreview(await readAsDataUrl(nextFile));
    setCandidates([]);
    setSelectedFoodId("");
    setStatus("idle");
    setStatusText("");
  }

  async function analyze() {
    if (!file) return;
    setStatus("analyzing");
    setStatusText("AIの準備をしています");
    try {
      const nextCandidates = await analyzeFoodPhoto(file, (progress) => setStatusText(progress.percent ? `${progress.label} ${progress.percent}%` : progress.label));
      setCandidates(nextCandidates);
      setSelectedFoodId(nextCandidates[0]?.id ?? "");
      setStatus("complete");
      setStatusText(nextCandidates.length ? "候補を確認して、正しい料理を選んでください。" : "候補を見つけられませんでした。手入力で追加してください。");
    } catch {
      setStatus("error");
      setStatusText("AIモデルを読み込めませんでした。通信環境を確認して、もう一度お試しください。");
    }
  }

  async function addConfirmedFood() {
    if (!file || !selectedFoodId) return;
    const confirmed = findFoodById(selectedFoodId);
    if (!confirmed) return;
    await recordFoodPhotoTrainingSample({
      id: createId("food-photo"),
      image: file,
      predictedFoodIds: candidates.map((candidate) => candidate.id),
      confirmedFoodId: confirmed.id,
      createdAt: new Date().toISOString(),
    });
    onAddFood(confirmed.food);
    setStatusText(`${confirmed.food.name}をメニューに追加し、正解データとして保存しました。`);
  }

  return <section className="mt-6 rounded-2xl border border-[var(--sage-soft)] bg-[#f6faf6] p-4">
    <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--sage-soft)] text-[var(--sage-deep)]"><Icon name="camera" className="size-5" /></span><div><h3 className="text-sm font-bold text-[var(--ink)]">写真からメニューを追加</h3><p className="mt-1 text-xs leading-5 text-[var(--muted)]">無料AIが候補を出します。写真は外部に送信せず、この端末内で処理・保存します。</p></div></div>
    <div className="mt-4 flex gap-3">{preview ? <div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-white"><Image src={preview} alt="食事写真のプレビュー" fill unoptimized className="object-cover" /></div> : null}<label className="flex min-h-20 flex-1 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[#bfc8c1] bg-white px-3 text-center transition hover:border-[var(--sage-deep)]"><Icon name="camera" className="size-5 text-[var(--sage-deep)]" /><span className="mt-1 text-xs font-bold text-[var(--ink)]">食事写真を選ぶ</span><input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(event) => void handleFile(event)} /></label></div>
    {file && status !== "complete" ? <Button type="button" className="mt-3 w-full" onClick={() => void analyze()} disabled={status === "analyzing"}>{status === "analyzing" ? statusText : "写真をAIで解析"}</Button> : null}
    {status === "complete" ? <div className="mt-4"><p className="text-xs font-bold text-[var(--sage-deep)]">AIの候補（栄養素は標準量の目安です）</p><div className="mt-2 space-y-2">{candidates.map((candidate) => <label key={candidate.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border bg-white p-3 transition ${selectedFoodId === candidate.id ? "border-[var(--sage-deep)] bg-[var(--sage-soft)]" : "border-[var(--line)]"}`}><input className="sr-only" type="radio" name="photo-food" value={candidate.id} checked={selectedFoodId === candidate.id} onChange={() => setSelectedFoodId(candidate.id)} /><span className={`grid size-5 shrink-0 place-items-center rounded-full border ${selectedFoodId === candidate.id ? "border-[var(--sage-deep)] bg-[var(--sage-deep)] text-white" : "border-[#cdd3cf]"}`}>{selectedFoodId === candidate.id ? <Icon name="check" className="size-3.5" /> : null}</span><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-[var(--ink)]">{candidate.food.name}</span><span className="mt-1 block text-[11px] text-[var(--muted)]">{candidate.food.calories} kcal · 推定 {(candidate.modelScore * 100).toFixed(0)}%</span></span></label>)}</div><label className="mt-3 block text-xs font-bold text-[var(--ink)]">候補が違うときの正解<select value={selectedFoodId} onChange={(event) => setSelectedFoodId(event.target.value)} className="mt-2 h-10 w-full rounded-xl border border-[var(--line)] bg-white px-3 text-sm font-medium outline-none focus:border-[var(--sage-deep)]"><option value="">正しい料理を選択</option>{foodCatalog.map((food) => <option key={food.id} value={food.id}>{food.food.name}</option>)}</select></label><Button type="button" className="mt-3 w-full" onClick={() => void addConfirmedFood()} disabled={!selectedFoodId}>正解として追加・学習</Button></div> : null}
    {statusText && status !== "analyzing" ? <p className={`mt-3 text-xs leading-5 ${status === "error" ? "text-[var(--coral)]" : "text-[var(--muted)]"}`}>{statusText}</p> : null}
    <p className="mt-3 text-[10px] leading-4 text-[var(--muted)]">初回のみモデルのダウンロードに時間がかかります。正解として確定した写真と料理名は、端末内に最大150件保存され、候補の並び順に反映されます。</p>
  </section>;
}
