"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldLabel, TextInput } from "@/components/ui/form-fields";
import { Icon } from "@/components/ui/icon";
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

  useEffect(() => { void loadHistory(); }, []);
  async function loadHistory() { setHistory(await bodyMakeClient.getMeals()); }
  const totals = useMemo(() => ({ calories: totalOf(foods, "calories"), proteinG: totalOf(foods, "proteinG"), fatG: totalOf(foods, "fatG"), carbsG: totalOf(foods, "carbsG") }), [foods]);
  function updateFood(id: string, patch: Partial<MealFoodItem>) { setFoods((current) => current.map((food) => food.id === id ? { ...food, ...patch } : food)); }
  function removeFood(id: string) { setFoods((current) => current.length > 1 ? current.filter((food) => food.id !== id) : current); }
  function addPhotoFood(food: Omit<MealFoodItem, "id">) {
    const nextFood = { ...food, id: createId("food") };
    setFoods((current) => current.length === 1 && !current[0].name ? [nextFood] : [...current, nextFood]);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validFoods = foods.filter((food) => food.name.trim());
    if (!validFoods.length) return;
    setIsSaving(true);
    await bodyMakeClient.saveMeal({ id: createId("meal"), mealType, name: validFoods.map((food) => food.name.trim()).join("・"), items: validFoods, ...totals, recordedAt, createdAt: new Date().toISOString() });
    setFoods([newFood()]);
    setIsSaving(false);
    await loadHistory();
  }
  async function deleteEntry(id: string) { await bodyMakeClient.deleteMeal(id); await loadHistory(); }

  return <>
    <PageHeader eyebrow="MEAL LOG" title="食事を記録" description="朝・昼・夜・間食ごとに、食べたメニューを追加できます。" />
    <form onSubmit={handleSubmit} className="space-y-4">
      <Card>
        <div className="flex items-center justify-between gap-3"><p className="text-sm font-bold text-[var(--ink)]">{formatDate(recordedAt)}の食事</p><input type="date" aria-label="記録日" value={recordedAt} onChange={(event) => setRecordedAt(event.target.value)} className="rounded-lg border border-[var(--line)] bg-white px-2 py-1.5 text-xs text-[var(--ink)] outline-none" /></div>
        <div className="mt-4 grid grid-cols-4 gap-2">{mealTypes.map(([value, label]) => <button key={value} type="button" onClick={() => setMealType(value)} className={`min-h-12 rounded-xl px-1 text-[11px] font-bold transition ${mealType === value ? "bg-[var(--sage-deep)] text-white shadow-sm" : "bg-[var(--sand)] text-[var(--muted)]"}`}>{label}</button>)}</div>
        <div className="mt-6 flex items-center justify-between"><div><p className="text-sm font-bold text-[var(--ink)]">{mealTypeLabels[mealType]}のメニュー</p><p className="mt-1 text-xs text-[var(--muted)]">食べた料理をひとつずつ追加します。</p></div><span className="grid size-9 place-items-center rounded-xl bg-[#fff3e9] text-[#b46f42]"><Icon name="leaf" className="size-4" /></span></div>
        <PhotoMealAnalyzer onAddFood={addPhotoFood} />
        <div className="mt-4 space-y-3">{foods.map((food, index) => <div key={food.id} className="rounded-2xl border border-[var(--line)] bg-[#fdfdfc] p-4"><div className="mb-3 flex items-center justify-between"><p className="text-xs font-bold tracking-[0.08em] text-[var(--sage-deep)]">メニュー {index + 1}</p>{foods.length > 1 ? <button type="button" aria-label="このメニューを削除" onClick={() => removeFood(food.id)} className="inline-flex items-center gap-1 text-xs font-bold text-[var(--coral)]"><Icon name="trash" className="size-3.5" />削除</button> : null}</div><FieldLabel htmlFor={`food-${food.id}`}>料理名</FieldLabel><TextInput id={`food-${food.id}`} value={food.name} onChange={(event) => updateFood(food.id, { name: event.target.value })} placeholder="例：ご飯（白ごはん 100g）" /><div className="mt-3 grid grid-cols-2 gap-2"><div><FieldLabel htmlFor={`calories-${food.id}`}>カロリー kcal</FieldLabel><TextInput id={`calories-${food.id}`} type="number" min="0" inputMode="numeric" value={food.calories ?? ""} onChange={(event) => updateFood(food.id, { calories: event.target.value ? Number(event.target.value) : undefined })} placeholder="156" /></div><div className="grid grid-cols-3 gap-1.5"><div><FieldLabel htmlFor={`protein-${food.id}`}>P</FieldLabel><TextInput id={`protein-${food.id}`} type="number" min="0" step="0.1" inputMode="decimal" value={food.proteinG ?? ""} onChange={(event) => updateFood(food.id, { proteinG: event.target.value ? Number(event.target.value) : undefined })} placeholder="0" /></div><div><FieldLabel htmlFor={`fat-${food.id}`}>F</FieldLabel><TextInput id={`fat-${food.id}`} type="number" min="0" step="0.1" inputMode="decimal" value={food.fatG ?? ""} onChange={(event) => updateFood(food.id, { fatG: event.target.value ? Number(event.target.value) : undefined })} placeholder="0" /></div><div><FieldLabel htmlFor={`carbs-${food.id}`}>C</FieldLabel><TextInput id={`carbs-${food.id}`} type="number" min="0" step="0.1" inputMode="decimal" value={food.carbsG ?? ""} onChange={(event) => updateFood(food.id, { carbsG: event.target.value ? Number(event.target.value) : undefined })} placeholder="0" /></div></div></div></div>)}</div>
        <Button type="button" variant="secondary" className="mt-4 w-full border-dashed text-[var(--sage-deep)]" onClick={() => setFoods((current) => [...current, newFood()])}><Icon name="plus" className="size-4" />メニューを追加</Button>
        <div className="mt-5 rounded-xl bg-[var(--sand)] px-4 py-3"><p className="text-[10px] font-bold tracking-[0.08em] text-[var(--muted)]">この食事の合計</p><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-[var(--ink)]"><span>{totals.calories ?? "--"} kcal</span><span>P {totals.proteinG ?? "--"}g</span><span>F {totals.fatG ?? "--"}g</span><span>C {totals.carbsG ?? "--"}g</span></div></div>
      </Card>
      <Button type="submit" className="w-full" disabled={isSaving}>{isSaving ? "保存中..." : `${mealTypeLabels[mealType]}を保存`}</Button>
    </form>
    <section className="mt-9"><h2 className="font-display text-xl font-semibold tracking-[-0.035em] text-[var(--ink)]">最近の食事</h2>{history.length === 0 ? <Card className="mt-3 text-center"><Icon name="leaf" className="mx-auto size-6 text-[#c6905d]" /><p className="mt-2 text-sm font-semibold text-[var(--ink)]">まだ記録がありません</p><p className="mt-1 text-xs text-[var(--muted)]">食べたものを一つから残してみましょう。</p></Card> : <div className="mt-3 space-y-3">{history.map((entry) => <Card key={entry.id} className="p-4"><div className="flex items-start justify-between"><div><div className="flex items-center gap-2"><span className="rounded-full bg-[#fff3e9] px-2.5 py-1 text-[10px] font-bold text-[#b46f42]">{mealTypeLabels[entry.mealType]}</span><span className="text-xs font-semibold text-[var(--muted)]">{formatDate(entry.recordedAt)}</span></div><p className="mt-2 text-sm font-bold text-[var(--ink)]">{entry.name}</p></div><button type="button" aria-label="この食事記録を削除" onClick={() => void deleteEntry(entry.id)} className="rounded-lg p-1.5 text-[#9aa19e] hover:bg-[var(--coral-soft)] hover:text-[var(--coral)]"><Icon name="trash" className="size-4" /></button></div>{entry.items?.length ? <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{entry.items.length}品：{entry.items.map((item) => item.name).join("・")}</p> : null}<div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-[var(--muted)]">{entry.calories !== undefined ? <span>{entry.calories} kcal</span> : null}{entry.proteinG !== undefined ? <span>P {entry.proteinG}g</span> : null}{entry.fatG !== undefined ? <span>F {entry.fatG}g</span> : null}{entry.carbsG !== undefined ? <span>C {entry.carbsG}g</span> : null}</div></Card>)}</div>}</section>
  </>;
}
