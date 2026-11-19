"use client";

import { FormEvent, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { FieldLabel, TextInput } from "@/components/ui/form-fields";
import { PageHeader } from "@/components/ui/page-header";
import { Icon } from "@/components/ui/icon";
import { FoodLibrarySearch } from "@/components/meals/food-library-search";
import { RecordActions } from "@/components/ui/record-actions";
import { PhotoMealAnalyzer } from "@/components/meals/photo-meal-analyzer";
import { BarcodeMealEntry } from "@/components/meals/barcode-meal-entry";
import { bodyMakeClient } from "@/lib/api/client";
import { toDateInputValue, toTimeInputValue } from "@/lib/utils/date";
import { summarizeDailyCalories } from "@/lib/utils/meal-calories";
import { summarizeDailyMacros } from "@/lib/utils/meal-macros";
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

function recordedCalories(entry: MealEntry): number | undefined {
  if (typeof entry.calories === "number" && Number.isFinite(entry.calories) && entry.calories >= 0) return entry.calories;
  if (entry.items?.length && entry.items.every((item) => typeof item.calories === "number" && Number.isFinite(item.calories) && item.calories >= 0)) {
    return entry.items.reduce((sum, item) => sum + (item.calories ?? 0), 0);
  }
  return undefined;
}

const mealTypes = Object.entries(mealTypeLabels) as Array<[MealType, string]>;
const barcodeDraftKey = "bodymake:meal-barcode-draft:v1";
const barcodeDraftEvent = "bodymake:meal-barcode-draft-change";
let memoryBarcodeDraft = "";

function readBarcodeDraft(): string {
  if (typeof window === "undefined") return "";
  try { return window.sessionStorage.getItem(barcodeDraftKey) ?? memoryBarcodeDraft; }
  catch { return memoryBarcodeDraft; }
}

function subscribeBarcodeDraft(onChange: () => void): () => void {
  window.addEventListener(barcodeDraftEvent, onChange);
  return () => window.removeEventListener(barcodeDraftEvent, onChange);
}

function updateBarcodeDraft(value: string) {
  memoryBarcodeDraft = value;
  try { window.sessionStorage.setItem(barcodeDraftKey, value); } catch { /* Keep the draft in memory if storage is unavailable. */ }
  window.dispatchEvent(new Event(barcodeDraftEvent));
}

export function MealRecorder() {
  const [mealType, setMealType] = useState<MealType>("breakfast");
  const [recordedAt, setRecordedAt] = useState(toDateInputValue());
  const [recordedTime, setRecordedTime] = useState("");
  const [manualFood, setManualFood] = useState<MealFoodItem>(newFood);
  const [history, setHistory] = useState<MealEntry[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [inputMode, setInputMode] = useState<"search" | "photo" | "manual" | "barcode">("search");
  const barcodeDraft = useSyncExternalStore(subscribeBarcodeDraft, readBarcodeDraft, () => "");
  const [composerOpen, setComposerOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const composerHeading = useRef<HTMLHeadingElement>(null);
  const saveLock = useRef(false);
  const pendingSave = useRef<{ key: string; id: string } | null>(null);
  const historyRevision = useRef(0);
  const dayMeals = useMemo(() => history.filter((entry) => entry.recordedAt === recordedAt), [history, recordedAt]);
  const dayCalories = useMemo(() => summarizeDailyCalories(history, recordedAt), [history, recordedAt]);
  const dayMacros = useMemo(() => summarizeDailyMacros(history, recordedAt), [history, recordedAt]);
  const hasMissingCalories = dayCalories.missingMeals > 0 || dayCalories.partiallyCountedMeals > 0;
  const macroEnergy = dayMacros.proteinG * 4 + dayMacros.fatG * 9 + dayMacros.carbsG * 4;
  const proteinShare = macroEnergy > 0 ? dayMacros.proteinG * 4 / macroEnergy * 100 : 0;
  const fatShare = macroEnergy > 0 ? dayMacros.fatG * 9 / macroEnergy * 100 : 0;

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
  function openComposer(type: MealType) {
    setMealType(type);
    setComposerOpen(true);
    setNotice("");
    requestAnimationFrame(() => composerHeading.current?.focus());
  }

  return <>
    <PageHeader title="食事" />
    <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2">
      <label htmlFor="meal-date" className="text-sm font-semibold text-[var(--ink-soft)]">記録日</label>
      <input id="meal-date" type="date" value={recordedAt} onChange={(event) => setRecordedAt(event.target.value)} required className="form-input w-auto max-w-full" />
    </div>
    <div className="grid items-start gap-5 md:grid-cols-[minmax(0,1.12fr)_minmax(0,.88fr)]">
      <section aria-labelledby="meal-list-title" className="overflow-hidden rounded-lg border border-[var(--line)] bg-white">
        <h2 id="meal-list-title" className="section-title border-b border-[var(--line)] px-5 py-4 sm:px-6">食事の一覧</h2>
        {mealTypes.map(([type, label]) => {
          const entries = dayMeals.filter((entry) => entry.mealType === type);
          const totals = summarizeDailyCalories(entries, recordedAt);
          const incomplete = totals.missingMeals > 0 || totals.partiallyCountedMeals > 0;
          const caloriesLabel = totals.countedMeals === 0 ? "カロリー未入力" : `${incomplete ? "入力済み分 " : ""}${Math.round(totals.calories)} kcal`;
          return <article key={type} className="border-b border-[var(--line)] last:border-b-0">
            <div className="flex items-center justify-between gap-3 px-5 py-4 sm:px-6">
              <div>
                <h3 className="font-bold text-[var(--ink)]">{label}</h3>
                <p className="metric mt-1 text-sm text-[var(--muted)]">{entries.length ? `${caloriesLabel} · ${entries.length}品` : "未記録"}</p>
              </div>
              <button id={`meal-add-${type}`} type="button" onClick={() => openComposer(type)} aria-label={`${label}に食品を追加`} aria-expanded={composerOpen && mealType === type} className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-md bg-[var(--sage-soft)] px-4 text-sm font-bold text-[var(--sage-deep)] hover:bg-[var(--sage-deep)] hover:text-white">
                <Icon name="plus" className="size-4" />追加
              </button>
            </div>
            {entries.length > 0 && <div className="border-t border-[var(--line)] px-4 sm:px-5">{entries.map((entry) => <div key={entry.id} className="flex min-h-16 items-center gap-3 border-b border-[var(--line)] py-2 last:border-b-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[var(--ink)]">{entry.name}</p>
                <p className="mt-0.5 text-xs text-[var(--muted)]">{entry.recordedTime || "時刻なし"}{entry.items?.[0]?.portionQuantity ? ` · ${entry.items[0].portionQuantity}${entry.items[0].portionUnit ?? "g"}` : ""}</p>
                {entry.items?.[0]?.sourceBarcode && <a href={`https://world.openfoodfacts.org/product/${encodeURIComponent(entry.items[0].sourceBarcode)}`} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--sage-deep)] underline">出典：Open Food Facts</a>}
              </div>
              <span className="metric shrink-0 text-xs font-semibold text-[var(--ink)]">{recordedCalories(entry) === undefined ? "—" : `${Math.round(recordedCalories(entry) ?? 0)} kcal`}</span>
              <button type="button" aria-label={`${entry.name}の食事記録を削除`} onClick={() => void deleteEntry(entry.id)} className="delete-button shrink-0"><Icon name="trash" className="size-4" /></button>
            </div>)}</div>}
          </article>;
        })}
      </section>
      <section aria-labelledby="meal-nutrition-title" className="rounded-lg border border-[var(--line)] bg-white p-5 sm:p-6">
        <h2 id="meal-nutrition-title" className="section-title">1日の合計</h2>
        <p className="mt-5 text-sm font-semibold text-[var(--ink-soft)]">摂取カロリー{hasMissingCalories && dayCalories.countedMeals > 0 && "（入力済み分）"}</p>
        <p className="metric mt-1 text-4xl font-semibold text-[var(--ink)]">
          {dayCalories.countedMeals === 0 && dayCalories.mealCount > 0 ? "—" : Math.round(dayCalories.calories).toLocaleString("ja-JP")}
          <span className="ml-2 text-sm font-medium text-[var(--muted)]">kcal</span>
        </p>
        <p className="mt-5 border-t border-[var(--sage-deep)]/20 pt-4 text-sm font-bold">PFCバランス</p>
        <div aria-hidden="true" className="mt-3 flex h-2 overflow-hidden rounded-full bg-white">
          {macroEnergy > 0 && <>
            <span className="bg-[var(--sage-deep)]" style={{ width: `${proteinShare}%` }} />
            <span className="bg-[var(--coral)]" style={{ width: `${fatShare}%` }} />
            <span className="grow bg-[#9b874d]" />
          </>}
        </div>
        <dl className="mt-3 divide-y divide-[var(--sage-deep)]/15">
          {([
            ["たんぱく質", "proteinG", "bg-[var(--sage-deep)]"],
            ["脂質", "fatG", "bg-[var(--coral)]"],
            ["炭水化物", "carbsG", "bg-[#9b874d]"],
          ] as const).map(([label, key, swatch]) => <div key={key} className="flex items-baseline justify-between gap-2 py-2 text-sm">
            <dt className="flex items-center gap-2 text-[var(--ink-soft)]"><span aria-hidden="true" className={`size-2 rounded-full ${swatch}`} />{label}</dt>
            <dd className="metric font-semibold">{dayMacros.mealCount > 0 && dayMacros.knownCounts[key] === 0 ? "—" : Math.round(dayMacros[key] * 10) / 10} g</dd>
          </div>)}
        </dl>
        {(hasMissingCalories || dayMacros.incompleteMeals > 0) && <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">栄養値は入力済みの分を集計しています。「—」は未入力です。</p>}
      </section>
    </div>
    {composerOpen && <div className="panel mt-6">
      <form onSubmit={handleSubmit}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 ref={composerHeading} tabIndex={-1} className="section-title scroll-mt-6">{mealTypeLabels[mealType]}に追加</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">追加した食品はそのまま保存されます。</p>
          </div>
          <button type="button" onClick={() => { setComposerOpen(false); document.getElementById(`meal-add-${mealType}`)?.focus(); }} className="text-link">閉じる</button>
        </div>
        <div className="mt-4 max-w-44"><FieldLabel htmlFor="meal-time">時刻</FieldLabel><TextInput id="meal-time" type="time" step="60" value={recordedTime} onChange={(event) => setRecordedTime(event.target.value)} required /></div>
        <div className="mt-4 grid grid-cols-4 gap-2" aria-label="食事の入力方法">{([
          ["search", "search", "検索"],
          ["photo", "camera", "写真"],
          ["manual", "plus", "手入力"],
          ["barcode", "barcode", "バーコード"],
        ] as const).map(([mode, icon, label]) => <button key={mode} type="button" onClick={() => setInputMode(mode)} aria-pressed={inputMode === mode} className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg border px-1 text-xs font-semibold sm:min-h-12 sm:flex-row sm:gap-2 sm:px-2 sm:text-sm ${inputMode === mode ? "border-[var(--sage-deep)] bg-[var(--sage-soft)] text-[var(--sage-deep)]" : "border-[var(--line)] text-[var(--muted)] hover:bg-[var(--sand)]"}`}><Icon name={icon} className="size-4 shrink-0" />{label}</button>)}</div>
        <div hidden={inputMode !== "search"}><FoodLibrarySearch onAddFood={saveFood} /></div>
        {inputMode === "photo" && <PhotoMealAnalyzer onAddFood={saveFood} />}
        {inputMode === "barcode" && <BarcodeMealEntry onAddFood={saveFood} barcode={barcodeDraft} onBarcodeChange={updateBarcodeDraft} />}
        {inputMode === "photo" && <p role="status" aria-live="polite" className="mt-4 text-sm text-[var(--sage-deep)]">{notice}</p>}
        {inputMode === "manual" && <>
        <p className="mt-4 text-xs leading-6 text-[var(--muted)]">不明な栄養値は空欄のまま保存できます。</p>
        <section className="mt-5">
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
        <RecordActions label={isSaving ? "保存中…" : "追加して保存"} summary={mealTypeLabels[mealType]} disabled={isSaving || !manualFood.name.trim() || invalidManualPortion(manualFood)} notice={notice} />
        </>}
      </form>
    </div>}
  </>;
}
