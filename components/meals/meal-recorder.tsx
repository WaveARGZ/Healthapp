"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { FieldLabel, TextInput } from "@/components/ui/form-fields";
import { Icon } from "@/components/ui/icon";
import { FoodLibrarySearch } from "@/components/meals/food-library-search";
import { RecordActions } from "@/components/ui/record-actions";
import { PageHeader } from "@/components/ui/page-header";
import { PhotoMealAnalyzer } from "@/components/meals/photo-meal-analyzer";
import { bodyMakeClient } from "@/lib/api/client";
import { formatDate, toDateInputValue, toTimeInputValue } from "@/lib/utils/date";
import { createId } from "@/lib/utils/id";
import { mealTypeLabels, type MealEntry, type MealFoodItem, type MealType } from "@/types/meal";

function newFood(): MealFoodItem {
  return { id: createId("food"), name: "", calories: undefined, proteinG: undefined, fatG: undefined, carbsG: undefined };
}

function foodWithManualPortion(food: MealFoodItem): MealFoodItem {
  if (food.portionGrams !== undefined || !food.portionQuantity || food.portionQuantity <= 0) return food;
  const unit = food.portionUnit ?? "g";
  return {
    ...food,
    name: `${food.name.trim()}（${food.portionQuantity}${unit}）`,
    ...(unit === "g" ? { portionGrams: food.portionQuantity } : {}),
  };
}

function invalidManualPortion(food: MealFoodItem): boolean {
  if (food.portionGrams !== undefined || food.portionQuantity === undefined) return false;
  return !Number.isFinite(food.portionQuantity) || food.portionQuantity <= 0 || food.portionQuantity > 3000
    || ((food.portionUnit === "個" || food.portionUnit === "本") && !Number.isInteger(food.portionQuantity));
}

const mealTypes = Object.entries(mealTypeLabels) as Array<[MealType, string]>;

export function MealRecorder() {
  const [mealType, setMealType] = useState<MealType>("breakfast");
  const [recordedAt, setRecordedAt] = useState(toDateInputValue());
  const [recordedTime, setRecordedTime] = useState("");
  const [manualFood, setManualFood] = useState<MealFoodItem>(newFood);
  const [history, setHistory] = useState<MealEntry[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [inputMode, setInputMode] = useState<"search" | "photo" | "manual">("search");
  const [notice, setNotice] = useState("");
  const saveLock = useRef(false);
  const pendingSave = useRef<{ key: string; id: string } | null>(null);
  const historyRevision = useRef(0);

  useEffect(() => {
    void loadHistory();
    const frame = requestAnimationFrame(() => setRecordedTime(toTimeInputValue()));
    return () => cancelAnimationFrame(frame);
  }, []);
  async function loadHistory() {
    const revision = historyRevision.current;
    const entries = await bodyMakeClient.getMeals();
    if (revision === historyRevision.current) setHistory(entries);
  }
  function updateManualFood(patch: Partial<MealFoodItem>) { setManualFood((current) => ({ ...current, ...patch })); }
  async function saveFood(food: Omit<MealFoodItem, "id"> | MealFoodItem) {
    if (saveLock.current) throw new Error("保存中です。");
    const item = foodWithManualPortion({ ...food, id: "id" in food ? food.id : createId("food") });
    if (!item.name.trim() || invalidManualPortion(item) || !recordedAt) {
      setNotice("記録日・料理名・食べた量を確認してください。");
      throw new Error("入力内容を確認してください。");
    }
    const key = JSON.stringify([mealType, recordedAt, recordedTime, food]);
    if (pendingSave.current?.key !== key) pendingSave.current = { key, id: createId("meal") };
    const mealId = pendingSave.current.id;
    saveLock.current = true;
    setIsSaving(true);
    setNotice("保存中…");
    try {
      const entry: MealEntry = { id: mealId, mealType, name: item.name.trim(), items: [item], calories: item.calories, proteinG: item.proteinG, fatG: item.fatG, carbsG: item.carbsG, recordedAt, recordedTime: recordedTime || toTimeInputValue(), createdAt: new Date().toISOString() };
      await bodyMakeClient.saveMeal(entry);
      pendingSave.current = null;
      historyRevision.current += 1;
      setHistory((current) => [entry, ...current.filter((saved) => saved.id !== entry.id)]);
      setNotice(`${item.name.trim()}を保存しました。`);
    } catch {
      setNotice("保存できませんでした。通信状態を確認して、もう一度追加してください。");
      throw new Error("食事の保存に失敗しました。");
    } finally { saveLock.current = false; setIsSaving(false); }
  }
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inputMode !== "manual") return;
    try {
      await saveFood(manualFood);
      setManualFood(newFood());
    } catch { /* The visible notice keeps the input available for retry. */ }
  }
  async function deleteEntry(id: string) {
    await bodyMakeClient.deleteMeal(id);
    historyRevision.current += 1;
    await loadHistory();
  }

  return <>
    <PageHeader title="食事" description="食べたものと、その日の栄養を記録。" />
    <form onSubmit={handleSubmit}>
      <div className="grid w-full min-w-0 grid-cols-2 gap-3 sm:max-w-sm">
        <div className="min-w-0"><FieldLabel htmlFor="meal-date">記録日</FieldLabel><TextInput id="meal-date" type="date" value={recordedAt} onChange={(event) => setRecordedAt(event.target.value)} required /></div>
        <div className="min-w-0"><FieldLabel htmlFor="meal-time">時刻</FieldLabel><TextInput id="meal-time" type="time" step="60" value={recordedTime} onChange={(event) => setRecordedTime(event.target.value)} required /></div>
      </div>
      <div className="mb-6 mt-5 grid grid-cols-4 border-b border-[var(--line)]" aria-label="食事の時間帯">{mealTypes.map(([value, label]) => <button key={value} type="button" onClick={() => setMealType(value)} aria-pressed={mealType === value} className="choice-tab">{label}</button>)}</div>
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="section-title">メニューを追加</h2><span className="text-xs text-[var(--muted)]">{mealTypeLabels[mealType]}</span></div>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">メニューを追加すると、そのまま食事記録に保存されます。別の保存操作は不要です。</p>
      <div className="mt-4 grid grid-cols-3 gap-2" aria-label="食事の入力方法">{([
        ["search", "search", "検索"],
        ["photo", "camera", "写真"],
        ["manual", "plus", "手入力"],
      ] as const).map(([mode, icon, label]) => <button key={mode} type="button" onClick={() => setInputMode(mode)} aria-pressed={inputMode === mode} className={`flex min-h-12 items-center justify-center gap-2 rounded-md border px-2 text-sm font-semibold ${inputMode === mode ? "border-[var(--sage-deep)] bg-[var(--sage-soft)] text-[var(--sage-deep)]" : "border-[var(--line)] text-[var(--muted)]"}`}><Icon name={icon} className="size-4 shrink-0" />{label}</button>)}</div>
      <div hidden={inputMode !== "search"}><FoodLibrarySearch onAddFood={saveFood} /></div>
      <div hidden={inputMode !== "photo"}><PhotoMealAnalyzer onAddFood={saveFood} /></div>
      {inputMode !== "manual" && <p role="status" aria-live="polite" className="mt-4 text-sm text-[var(--sage-deep)]">{notice}</p>}
      {inputMode === "manual" && <>
      <p className="mt-4 text-xs leading-6 text-[var(--muted)]">料理名・食べた量・栄養値を入力してください。不明な栄養値は空欄でも保存できます。</p>
      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between"><h2 className="section-title">{mealTypeLabels[mealType]}のメニュー</h2></div>
        <div className="min-w-0 rounded-md border border-[var(--line)] p-3 min-[375px]:p-4 sm:p-5">
          <FieldLabel htmlFor={`food-${manualFood.id}`}>料理名</FieldLabel><TextInput id={`food-${manualFood.id}`} value={manualFood.name} onChange={(event) => updateManualFood({ name: event.target.value })} placeholder="例：卵" />
          {manualFood.portionGrams === undefined && <div className="mt-4"><FieldLabel htmlFor={`portion-${manualFood.id}`}>食べた量（任意）</FieldLabel><div className="mt-1 flex flex-wrap items-center gap-2"><TextInput id={`portion-${manualFood.id}`} type="number" min="1" max="3000" step="1" inputMode="numeric" value={manualFood.portionQuantity ?? ""} onChange={(event) => updateManualFood({ portionQuantity: event.target.value ? Number(event.target.value) : undefined })} placeholder="例：2" className="max-w-36" /><select aria-label="食べた量の単位" value={manualFood.portionUnit ?? "g"} onChange={(event) => updateManualFood({ portionUnit: event.target.value as "g" | "個" | "本" })} className="h-12 rounded border border-[var(--line)] bg-white px-3 text-base text-[var(--ink)]"><option value="g">g</option><option value="個">個</option><option value="本">本</option></select></div></div>}
          {invalidManualPortion(manualFood) && <p className="mt-2 text-xs text-[var(--coral)]">1〜3,000の量を入力してください。「個」「本」は整数で入力します。</p>}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{([
            ["calories", "カロリー (kcal)", "1"],
            ["proteinG", "たんぱく質 (g)", "0.1"],
            ["fatG", "脂質 (g)", "0.1"],
            ["carbsG", "炭水化物 (g)", "0.1"],
          ] as const).map(([field, label, step]) => <div key={field} className="min-w-0"><FieldLabel htmlFor={`${field}-${manualFood.id}`}>{label}</FieldLabel><TextInput id={`${field}-${manualFood.id}`} type="number" min="0" step={step} inputMode="decimal" value={manualFood[field] ?? ""} onChange={(event) => updateManualFood({ [field]: event.target.value ? Number(event.target.value) : undefined })} placeholder="未入力" className="metric" /></div>)}</div>
        </div>
      </section>

      <div className="mt-6 rounded-md bg-[var(--sand)] p-4 sm:p-5"><p className="mb-4 text-sm font-semibold">この食事の合計</p><dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">{([
        ["カロリー", manualFood.calories, "kcal"],
        ["たんぱく質", manualFood.proteinG, "g"],
        ["脂質", manualFood.fatG, "g"],
        ["炭水化物", manualFood.carbsG, "g"],
      ] as const).map(([label, value, unit]) => <div key={label} className="min-w-0"><dt className="text-xs text-[var(--muted)]">{label}</dt><dd className="metric mt-1 flex flex-wrap items-baseline gap-x-1 break-all text-2xl font-semibold">{value === undefined ? "—" : Math.round(value * 10) / 10}<span className="text-xs font-normal text-[var(--muted)]">{unit}</span></dd></div>)}</dl></div>
      <RecordActions label={isSaving ? "保存中…" : "このメニューを追加して保存"} summary={mealTypeLabels[mealType]} disabled={isSaving || !manualFood.name.trim() || invalidManualPortion(manualFood)} notice={notice} />
      </>}
    </form>
    <section className="mt-12"><div className="mb-4 flex items-center justify-between"><h2 className="section-title">最近の食事</h2><span className="text-xs text-[var(--muted)]">{history.length}件</span></div>
      {history.length === 0 ? <EmptyState description="保存した食事はここに表示されます。" /> : <div className="border-t border-[var(--line)]">{history.map((entry) => <article key={entry.id} className="border-b border-[var(--line)] py-5">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0 flex-1"><p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--muted)]"><span>{formatDate(entry.recordedAt)}{entry.recordedTime && <> <span className="metric">{entry.recordedTime}</span></>}</span><span className="font-semibold text-[var(--sage-deep)]">{mealTypeLabels[entry.mealType]}</span></p><h3 className="mt-2 break-words text-sm font-semibold leading-6">{entry.name}</h3></div><button type="button" aria-label="この食事記録を削除" onClick={() => void deleteEntry(entry.id)} className="delete-button shrink-0"><Icon name="trash" className="size-4" /></button></div>
        <div className="metric mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)]">{entry.calories !== undefined && <span className="font-semibold text-[var(--ink)]">{Math.round(entry.calories)} kcal</span>}{entry.proteinG !== undefined && <span>P {Math.round(entry.proteinG * 10) / 10}g</span>}{entry.fatG !== undefined && <span>F {Math.round(entry.fatG * 10) / 10}g</span>}{entry.carbsG !== undefined && <span>C {Math.round(entry.carbsG * 10) / 10}g</span>}</div>
      </article>)}</div>}
    </section>
  </>;
}
