"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FieldLabel, TextInput } from "@/components/ui/form-fields";
import { Icon } from "@/components/ui/icon";
import { FoodLibrarySearch } from "@/components/meals/food-library-search";
import { RecordActions } from "@/components/ui/record-actions";
import { PageHeader } from "@/components/ui/page-header";
import { PhotoMealAnalyzer } from "@/components/meals/photo-meal-analyzer";
import { bodyMakeClient } from "@/lib/api/client";
import { formatDate, toDateInputValue } from "@/lib/utils/date";
import { createId } from "@/lib/utils/id";
import { mealTypeLabels, type MealEntry, type MealFoodItem, type MealType } from "@/types/meal";

function newFood(): MealFoodItem {
  return { id: createId("food"), name: "", calories: undefined, proteinG: undefined, fatG: undefined, carbsG: undefined };
}

function totalOf(foods: MealFoodItem[], field: "calories" | "proteinG" | "fatG" | "carbsG"): number | undefined {
  const values = foods.map((food) => food[field]).filter((value): value is number => value !== undefined);
  return values.length ? values.reduce((total, value) => total + value, 0) : undefined;
}

const mealTypes = Object.entries(mealTypeLabels) as Array<[MealType, string]>;

export function MealRecorder() {
  const [mealType, setMealType] = useState<MealType>("breakfast");
  const [recordedAt, setRecordedAt] = useState(toDateInputValue());
  const [foods, setFoods] = useState<MealFoodItem[]>([newFood()]);
  const [history, setHistory] = useState<MealEntry[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [inputMode, setInputMode] = useState<"search" | "photo" | "manual">("search");
  const [notice, setNotice] = useState("");

  useEffect(() => { void loadHistory(); }, []);
  async function loadHistory() { setHistory(await bodyMakeClient.getMeals()); }
  const totals = useMemo(() => ({ calories: totalOf(foods, "calories"), proteinG: totalOf(foods, "proteinG"), fatG: totalOf(foods, "fatG"), carbsG: totalOf(foods, "carbsG") }), [foods]);
  function updateFood(id: string, patch: Partial<MealFoodItem>) { setFoods((current) => current.map((food) => food.id === id ? { ...food, ...patch } : food)); }
  function removeFood(id: string) { setFoods((current) => current.length > 1 ? current.filter((food) => food.id !== id) : current); }
  function addPhotoFood(food: Omit<MealFoodItem, "id">) {
    const nextFood = { ...food, id: createId("food") };
    setFoods((current) => current.length === 1 && !current[0].name ? [nextFood] : [...current, nextFood]);
  }
  function addLibraryFood(food: Omit<MealFoodItem, "id">) {
    const nextFood = { ...food, id: createId("food") };
    setFoods((current) => current.length === 1 && !current[0].name ? [nextFood] : [...current, nextFood]);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validFoods = foods.filter((food) => food.name.trim());
    if (!validFoods.length) return;
    setIsSaving(true);
    setNotice("");
    try {
      await bodyMakeClient.saveMeal({ id: createId("meal"), mealType, name: validFoods.map((food) => food.name.trim()).join("・"), items: validFoods, ...totals, recordedAt, createdAt: new Date().toISOString() });
      setFoods([newFood()]);
      await loadHistory();
      setNotice("食事を保存しました。");
    } catch {
      setNotice("保存できませんでした。入力内容を確認して再度お試しください。");
    } finally { setIsSaving(false); }
  }
  async function deleteEntry(id: string) { await bodyMakeClient.deleteMeal(id); await loadHistory(); }

  return <>
    <PageHeader title="食事" description="食べたものと、その日の栄養を記録。" />
    <form onSubmit={handleSubmit}>
      <div className="w-full sm:w-48"><FieldLabel htmlFor="meal-date">記録日</FieldLabel><TextInput id="meal-date" type="date" value={recordedAt} onChange={(event) => setRecordedAt(event.target.value)} required /></div>
      <div className="mb-6 mt-5 grid grid-cols-4 border-b border-[var(--line)]" aria-label="食事の時間帯">{mealTypes.map(([value, label]) => <button key={value} type="button" onClick={() => setMealType(value)} aria-pressed={mealType === value} className="choice-tab">{label}</button>)}</div>
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="section-title">メニューを追加</h2><span className="text-xs text-[var(--muted)]">{mealTypeLabels[mealType]}</span></div>
      <div className="mt-4 grid grid-cols-3 gap-2" aria-label="食事の入力方法">{([
        ["search", "search", "検索"],
        ["photo", "camera", "写真"],
        ["manual", "plus", "手入力"],
      ] as const).map(([mode, icon, label]) => <button key={mode} type="button" onClick={() => setInputMode(mode)} aria-pressed={inputMode === mode} className={`flex min-h-12 items-center justify-center gap-2 rounded-md border px-2 text-sm font-semibold ${inputMode === mode ? "border-[var(--sage-deep)] bg-[var(--sage-soft)] text-[var(--sage-deep)]" : "border-[var(--line)] text-[var(--muted)]"}`}><Icon name={icon} className="size-4 shrink-0" />{label}</button>)}</div>
      <div hidden={inputMode !== "search"}><FoodLibrarySearch onAddFood={addLibraryFood} /></div>
      <div hidden={inputMode !== "photo"}><PhotoMealAnalyzer onAddFood={addPhotoFood} /></div>
      {inputMode === "manual" && <p className="mt-4 text-xs leading-6 text-[var(--muted)]">下の料理名と栄養の欄に入力してください。栄養が不明な項目は空欄でも保存できます。</p>}

      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between"><h2 className="section-title">{mealTypeLabels[mealType]}の内容</h2><span className="text-xs text-[var(--muted)]">{foods.filter((food) => food.name.trim()).length}品</span></div>
        <div className="space-y-4">{foods.map((food, index) => <div key={food.id} className="min-w-0 rounded-md border border-[var(--line)] p-3 min-[375px]:p-4 sm:p-5">
          <div className="mb-3 flex min-h-8 items-center justify-between"><p className="metric text-xs font-medium text-[var(--muted)]">メニュー {String(index + 1).padStart(2, "0")}</p>{foods.length > 1 && <button type="button" aria-label="このメニューを削除" onClick={() => removeFood(food.id)} className="delete-button"><Icon name="trash" className="size-4" /></button>}</div>
          <FieldLabel htmlFor={`food-${food.id}`}>料理名</FieldLabel><TextInput id={`food-${food.id}`} value={food.name} onChange={(event) => updateFood(food.id, { name: event.target.value })} placeholder="例：ご飯（白ごはん 100g）" />
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{([
            ["calories", "カロリー (kcal)", "1"],
            ["proteinG", "たんぱく質 (g)", "0.1"],
            ["fatG", "脂質 (g)", "0.1"],
            ["carbsG", "炭水化物 (g)", "0.1"],
          ] as const).map(([field, label, step]) => <div key={field} className="min-w-0"><FieldLabel htmlFor={`${field}-${food.id}`}>{label}</FieldLabel><TextInput id={`${field}-${food.id}`} type="number" min="0" step={step} inputMode="decimal" value={food[field] ?? ""} onChange={(event) => updateFood(food.id, { [field]: event.target.value ? Number(event.target.value) : undefined })} placeholder="未入力" className="metric" /></div>)}</div>
        </div>)}</div>
        <Button type="button" variant="secondary" className="mt-4 w-full" onClick={() => setFoods((current) => [...current, newFood()])}><Icon name="plus" className="size-4" />もう一品追加</Button>
      </section>

      <div className="mt-6 rounded-md bg-[var(--sand)] p-4 sm:p-5"><p className="mb-4 text-sm font-semibold">この食事の合計</p><dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">{([
        ["カロリー", totals.calories, "kcal"],
        ["たんぱく質", totals.proteinG, "g"],
        ["脂質", totals.fatG, "g"],
        ["炭水化物", totals.carbsG, "g"],
      ] as const).map(([label, value, unit]) => <div key={label} className="min-w-0"><dt className="text-xs text-[var(--muted)]">{label}</dt><dd className="metric mt-1 flex flex-wrap items-baseline gap-x-1 break-all text-2xl font-semibold">{value === undefined ? "—" : Math.round(value * 10) / 10}<span className="text-xs font-normal text-[var(--muted)]">{unit}</span></dd></div>)}</dl></div>
      <RecordActions label={isSaving ? "保存中…" : `${mealTypeLabels[mealType]}を保存`} summary={`${foods.filter((food) => food.name.trim()).length} 品`} disabled={isSaving || !foods.some((food) => food.name.trim())} notice={notice} />
    </form>
    <section className="mt-12"><div className="mb-4 flex items-center justify-between"><h2 className="section-title">最近の食事</h2><span className="text-xs text-[var(--muted)]">{history.length}件</span></div>
      {history.length === 0 ? <EmptyState description="保存した食事はここに表示されます。" /> : <div className="border-t border-[var(--line)]">{history.map((entry) => <article key={entry.id} className="border-b border-[var(--line)] py-5">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0 flex-1"><p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--muted)]"><span>{formatDate(entry.recordedAt)}</span><span className="font-semibold text-[var(--sage-deep)]">{mealTypeLabels[entry.mealType]}</span></p><h3 className="mt-2 break-words text-sm font-semibold leading-6">{entry.name}</h3></div><button type="button" aria-label="この食事記録を削除" onClick={() => void deleteEntry(entry.id)} className="delete-button shrink-0"><Icon name="trash" className="size-4" /></button></div>
        <div className="metric mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)]">{entry.calories !== undefined && <span className="font-semibold text-[var(--ink)]">{Math.round(entry.calories)} kcal</span>}{entry.proteinG !== undefined && <span>P {Math.round(entry.proteinG * 10) / 10}g</span>}{entry.fatG !== undefined && <span>F {Math.round(entry.fatG * 10) / 10}g</span>}{entry.carbsG !== undefined && <span>C {Math.round(entry.carbsG * 10) / 10}g</span>}</div>
      </article>)}</div>}
    </section>
  </>;
}
