"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { searchFoodGroups } from "@/lib/food-catalog-groups.mjs";
import { portionGrams, suggestedGramsPerPiece, validPortion, type FoodPortionUnit } from "@/lib/food-portions";
import libraryJson from "@/lib/data/food-library.json";
import { foodToMealItem, type FoodLibraryDataset, type FoodLibraryItem } from "@/types/food-database";
import type { MealFoodItem } from "@/types/meal";

interface FoodLibrarySearchProps {
  onAddFood: (food: Omit<MealFoodItem, "id">) => Promise<void>;
  onAddFoods: (foods: Omit<MealFoodItem, "id">[]) => Promise<void>;
}

type FoodGroup = ReturnType<typeof searchFoodGroups>["groups"][number];
type QueuedFood = { food: FoodLibraryItem; quantity: number; unit: FoodPortionUnit; gramsPerPiece: number; inferred?: boolean };

const library = libraryJson as FoodLibraryDataset;
const popularIds = ["rice", "natto", "miso-soup", "chicken-breast", "grilled-salmon", "ramen", "curry-rice", "banana"];
const popularFoods = popularIds.map((id) => library.foods.find((food) => food.id === id)).filter((food): food is FoodLibraryItem => Boolean(food));

function sourceLink(food: FoodLibraryItem): string {
  return food.sourceUrl ?? (food.foodCode ? "https://fooddb.mext.go.jp/" : `https://fdc.nal.usda.gov/food-search/?query=${food.fdcId}`);
}

function sourceLabel(food: FoodLibraryItem): string {
  return food.foodCode ? `文部科学省・食品番号 ${food.foodCode}` : food.sourceUrl ? food.sourceDataset : "定番食品データ";
}

function detailLabel(food: FoodLibraryItem): string {
  return food.foodCode ? food.sourceDescription ?? food.name : food.name;
}

export function FoodLibrarySearch({ onAddFood, onAddFoods }: FoodLibrarySearchProps) {
  const [query, setQuery] = useState("");
  const [searchEngaged, setSearchEngaged] = useState(false);
  const [expandedResults, setExpandedResults] = useState(false);
  const [saveNotice, setSaveNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [category, setCategory] = useState("すべて");
  const [extendedFoods, setExtendedFoods] = useState<FoodLibraryItem[]>([]);
  const [catalogStatus, setCatalogStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [visibleCount, setVisibleCount] = useState(30);
  const [activeGroup, setActiveGroup] = useState<FoodGroup | null>(null);
  const [selectedFood, setSelectedFood] = useState<FoodLibraryItem | null>(null);
  const [variantQuery, setVariantQuery] = useState("");
  const [visibleVariants, setVisibleVariants] = useState(10);
  const [quantity, setQuantity] = useState(100);
  const [unit, setUnit] = useState<FoodPortionUnit>("g");
  const [gramsPerPiece, setGramsPerPiece] = useState(100);
  const [queuedFoods, setQueuedFoods] = useState<QueuedFood[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const addingFood = useRef(false);
  const loadingCatalog = useRef<Promise<void> | null>(null);

  const allFoods = useMemo(() => [...library.foods, ...extendedFoods], [extendedFoods]);
  const categories = useMemo(() => ["すべて", ...new Set(allFoods.map((food) => food.category))], [allFoods]);

  function loadExtendedCatalog() {
    if (loadingCatalog.current || catalogStatus === "loaded") return;
    setCatalogStatus("loading");
    const url = new URL("../data/food-library-extended.json", window.location.href);
    url.searchParams.set("v", library.version);
    loadingCatalog.current = fetch(url).then(async (response) => {
      if (!response.ok) throw new Error(`Food library request failed: ${response.status}`);
      const data = await response.json() as FoodLibraryDataset;
      if (!Array.isArray(data.foods)) throw new Error("Invalid food library data");
      setExtendedFoods(data.foods);
      setCatalogStatus("loaded");
    }).catch(() => {
      loadingCatalog.current = null;
      setCatalogStatus("error");
    });
  }

  function clearSelection() {
    setActiveGroup(null);
    setSelectedFood(null);
    setVariantQuery("");
    setVisibleVariants(10);
  }

  const showPopular = !query.trim() && category === "すべて" && !expandedResults;
  const results = useMemo<ReturnType<typeof searchFoodGroups>>(
    () => searchEngaged || expandedResults ? searchFoodGroups(showPopular ? popularFoods : allFoods, showPopular ? "" : query, category) : { groups: [], inferredGroups: [], searchTerms: [], matchingRecords: 0, usedFuzzy: false },
    [searchEngaged, expandedResults, showPopular, allFoods, query, category],
  );
  const resultCount = results.groups.length + results.inferredGroups.length;
  const shownGroups = results.groups.slice(0, visibleCount);
  const previewGroups = results.groups.slice(0, 5);
  const previewInferredGroups = results.inferredGroups.slice(0, Math.max(0, 5 - previewGroups.length));
  const variantResults = useMemo(() => {
    if (!activeGroup) return [];
    const needle = variantQuery.trim().toLocaleLowerCase();
    if (!needle) return activeGroup.variants;
    return activeGroup.variants.filter((food) => `${food.name} ${food.foodCode ?? food.fdcId ?? ""} ${food.foodCode ? food.sourceDescription ?? "" : ""}`.toLocaleLowerCase().includes(needle));
  }, [activeGroup, variantQuery]);
  const grams = portionGrams(quantity, unit, gramsPerPiece);
  const valid = validPortion(quantity, unit, gramsPerPiece);
  const nutrition = selectedFood && valid ? foodToMealItem(selectedFood, grams, { unit, quantity, gramsPerPiece }) : null;
  const queuedItems = queuedFoods.map(({ food, quantity: amount, unit: portionUnit, gramsPerPiece: pieceGrams }) =>
    foodToMealItem(food, portionGrams(amount, portionUnit, pieceGrams), { unit: portionUnit, quantity: amount, gramsPerPiece: pieceGrams }));
  const queuedCalories = queuedItems.reduce((sum, item) => sum + (item.calories ?? 0), 0);

  function setFoodPortion(food: FoodLibraryItem) {
    const queued = queuedFoods.find((item) => item.food.id === food.id);
    if (queued) {
      setUnit(queued.unit);
      setGramsPerPiece(queued.gramsPerPiece);
      setQuantity(queued.quantity);
      return;
    }
    const pieceGrams = suggestedGramsPerPiece(food.id, food.name, food.suggestedGrams);
    setUnit(pieceGrams ? (food.id === "schau-essen" ? "本" : "個") : "g");
    setGramsPerPiece(pieceGrams ?? food.suggestedGrams);
    setQuantity(pieceGrams ? 1 : food.suggestedGrams);
  }

  function chooseGroup(group: FoodGroup) {
    setActiveGroup(group);
    setSearchEngaged(false);
    setExpandedResults(false);
    setSaveNotice(null);
    setVariantQuery("");
    setVisibleVariants(10);
    const onlyFood = group.variants.length === 1 ? group.variants[0] : null;
    setSelectedFood(onlyFood);
    if (onlyFood) setFoodPortion(onlyFood);
  }

  function chooseVariant(food: FoodLibraryItem) {
    setSelectedFood(food);
    setSaveNotice(null);
    setFoodPortion(food);
  }

  async function addSelectedFood() {
    if (!selectedFood || !valid || queuedFoods.length || addingFood.current) return;
    addingFood.current = true;
    setIsAdding(true);
    try {
      await onAddFood(foodToMealItem(selectedFood, grams, { unit, quantity, gramsPerPiece }));
      setSaveNotice({ text: `${selectedFood.name} ${quantity}${unit}を保存しました。`, error: false });
      clearSelection();
      setQuery("");
      setSearchEngaged(false);
      setExpandedResults(false);
    } catch { setSaveNotice({ text: "保存できませんでした。入力を確認して、もう一度お試しください。", error: true }); }
    finally { addingFood.current = false; setIsAdding(false); }
  }

  function queueSelectedFood() {
    if (!selectedFood || !valid || addingFood.current) return;
    const selection = { food: selectedFood, quantity, unit, gramsPerPiece, inferred: activeGroup?.inferred };
    const foodId = selectedFood.id;
    setQueuedFoods((current) => current.some((item) => item.food.id === foodId) ?
      current.map((item) => item.food.id === foodId ? selection : item) : [...current, selection]);
    setSaveNotice(null);
    clearSelection();
    setExpandedResults(Boolean(query.trim()));
    setSearchEngaged(false);
    requestAnimationFrame(() => searchInput.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function saveQueuedFoods() {
    if (!queuedFoods.length || addingFood.current) return;
    addingFood.current = true;
    setIsAdding(true);
    try {
      await onAddFoods(queuedItems);
      setSaveNotice({ text: `${queuedItems.length}品をまとめて保存しました。`, error: false });
      setQueuedFoods([]);
      clearSelection();
      setQuery("");
      setSearchEngaged(false);
      setExpandedResults(false);
    } catch { setSaveNotice({ text: "まとめて保存できませんでした。選択内容を確認して、もう一度お試しください。", error: true }); }
    finally { addingFood.current = false; setIsAdding(false); }
  }

  function renderGroup(group: FoodGroup) {
    const single = group.variants.length === 1 ? group.variants[0] : null;
    const alreadyQueued = group.variants.some((food) => queuedFoods.some((item) => item.food.id === food.id));
    return <button key={group.name} type="button" onClick={() => chooseGroup(group)} disabled={isAdding} className="flex min-h-14 w-full items-center justify-between gap-3 border-b border-[var(--line)] px-3 py-2.5 text-left last:border-b-0 hover:bg-[var(--sage-soft)] disabled:opacity-50">
      <span className="min-w-0"><span className="block break-words text-sm font-bold text-[var(--ink)]">{group.name}{alreadyQueued && <span className="ml-2 text-xs font-semibold text-[var(--sage-deep)]">選択中</span>}</span><span className="mt-0.5 block text-xs text-[var(--muted)]">{group.inferred ? `推測：${group.matchedTerms?.join("・")}に関連 · ` : ""}{single ? single.category : `${group.variants.length.toLocaleString()}品目から選択`}</span></span>
      {single ? <span className="metric shrink-0 text-sm font-semibold text-[var(--sage-deep)]">{single.per100g.calories}<span className="ml-1 text-xs font-normal">kcal</span></span> : <Icon name="chevron-right" className="size-4 shrink-0 text-[var(--sage-deep)]" />}
    </button>;
  }

  return <section className="mt-5">
    <label htmlFor="meal-food-search" className="text-sm font-bold text-[var(--ink)]">食品名</label>
    <p className="mt-1 text-sm leading-6 text-[var(--muted)]">食品を選んで量を設定すると、複数品をまとめて登録できます。</p>
    <div onMouseLeave={() => setSearchEngaged(false)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setSearchEngaged(false); }} className="relative mt-2">
    <div onMouseEnter={() => { if (!expandedResults) setSearchEngaged(true); loadExtendedCatalog(); }} className="flex min-h-12 items-center gap-1 rounded-lg border border-[var(--line)] bg-white px-1.5 focus-within:outline-2 focus-within:outline-[var(--sage-deep)]">
      <button type="button" aria-label="料理・食品の検索を開始" onClick={() => searchInput.current?.focus()} className="grid size-10 shrink-0 place-items-center rounded text-[var(--muted)] hover:text-[var(--sage-deep)]"><Icon name="search" className="size-4" /></button>
      <input id="meal-food-search" ref={searchInput} type="search" value={query} onFocus={() => { if (!expandedResults) setSearchEngaged(true); loadExtendedCatalog(); }} onChange={(event) => { setExpandedResults(false); setSearchEngaged(true); setSaveNotice(null); setQuery(event.target.value); setVisibleCount(30); clearSelection(); loadExtendedCatalog(); }} placeholder="例：白米、鶏肉と卵の炒め物" className="h-11 min-w-0 flex-1 bg-transparent text-base text-[var(--ink)] outline-none placeholder:text-[#a6ada9]" />
    </div>
    {searchEngaged && !expandedResults && <div className="absolute inset-x-0 top-full z-30 max-h-[min(28rem,65dvh)] overflow-y-auto overscroll-contain rounded-b-xl border border-t-0 border-[var(--line)] bg-white" role="region" aria-label="食品の検索候補">
      <div className="flex items-center gap-2 border-b border-[var(--line)] px-3 py-2"><p className="min-w-0 flex-1 text-xs font-semibold text-[var(--ink)]">{showPopular ? "検索候補" : `検索結果 ${resultCount.toLocaleString()}品目`}</p><select aria-label="食品のカテゴリ" value={category} onChange={(event) => { setCategory(event.target.value); setVisibleCount(30); clearSelection(); loadExtendedCatalog(); }} className="min-h-10 max-w-[55%] rounded-md border border-[var(--line)] bg-white px-2 text-xs text-[var(--ink)]">{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
      {results.usedFuzzy && <p className="px-3 py-2 text-xs text-[var(--sage-deep)]">入力に近い候補です。品目を確認してください。</p>}
      {results.inferredGroups.length > 0 && <p className="border-b border-[var(--line)] px-3 py-2 text-sm text-[var(--muted)]">検索語：{results.searchTerms.join("・")}。推測候補は食品名と栄養値を確認してください。</p>}
      {previewGroups.map(renderGroup)}
      {previewInferredGroups.length > 0 && <p className="bg-[var(--sage-soft)] px-3 py-2 text-xs font-bold text-[var(--sage-deep)]">食材名からの推測候補</p>}
      {previewInferredGroups.map(renderGroup)}
      {resultCount === 0 && <p className="px-3 py-4 text-xs text-[var(--muted)]">{catalogStatus === "loading" ? "食品データを読み込み中…" : "見つかりませんでした。別名や短い名前でお試しください。"}</p>}
      {resultCount > previewGroups.length + previewInferredGroups.length && <button type="button" onClick={() => { setExpandedResults(true); setSearchEngaged(false); setVisibleCount(30); }} className="min-h-11 w-full border-t border-[var(--line)] px-3 py-2 text-sm font-semibold text-[var(--sage-deep)] hover:bg-[var(--sage-soft)]">{showPopular ? "全食品の一覧を見る" : `残り${(resultCount - previewGroups.length - previewInferredGroups.length).toLocaleString()}品目を見る`}</button>}
      {catalogStatus === "error" && <button type="button" onClick={loadExtendedCatalog} className="text-link px-3">詳細データを再読み込み</button>}
    </div>}
    </div>
    {queuedFoods.length > 0 && <section aria-label="まとめて登録する食品" className="mt-4 rounded-xl border border-[var(--sage-deep)] bg-[var(--sage-soft)] p-3 sm:p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-sm font-bold text-[var(--ink)]">選択中の食品 · {queuedFoods.length}品</h3><p className="metric text-sm font-semibold text-[var(--sage-deep)]">合計 {queuedCalories} kcal</p></div>
      <ul className="mt-3 divide-y divide-[var(--line)]">{queuedFoods.map((selection, index) => <li key={selection.food.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
        <div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold text-[var(--ink)]">{selection.food.name}</p><p className="mt-0.5 text-xs text-[var(--muted)]">{selection.inferred ? "推測候補 · " : ""}{selection.quantity}{selection.unit} · {queuedItems[index]?.calories} kcal</p></div>
        <div className="flex shrink-0 gap-2"><button type="button" disabled={isAdding} onClick={() => chooseGroup({ name: selection.food.name, variants: [selection.food], inferred: selection.inferred })} className="min-h-11 rounded-md px-2 text-xs font-semibold text-[var(--sage-deep)] disabled:opacity-50">量を編集</button><button type="button" disabled={isAdding} onClick={() => setQueuedFoods((current) => current.filter((item) => item.food.id !== selection.food.id))} className="min-h-11 rounded-md px-2 text-xs font-semibold text-[var(--muted)] disabled:opacity-50">外す</button></div>
      </li>)}</ul>
      <Button type="button" className="mt-3 w-full" onClick={() => void saveQueuedFoods()} disabled={isAdding}>{isAdding ? "保存中…" : `${queuedFoods.length}品をまとめて保存`}</Button>
    </section>}
    {expandedResults && <div className="mt-4 rounded-xl border border-[var(--line)] bg-white" role="region" aria-label="食品の検索結果一覧">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-3 py-2"><p className="text-sm font-semibold">検索結果 {resultCount.toLocaleString()}品目</p><button type="button" onClick={() => setExpandedResults(false)} className="text-link">閉じる</button></div>
      {results.inferredGroups.length > 0 && <p className="px-3 py-2 text-sm text-[var(--muted)]">検索語：{results.searchTerms.join("・")}。推測候補は食品名と栄養値を確認してください。</p>}
      {shownGroups.map(renderGroup)}
      {results.groups.length > shownGroups.length && <button type="button" onClick={() => setVisibleCount((count) => count + 30)} className="min-h-11 w-full border-t border-[var(--line)] text-sm font-semibold text-[var(--sage-deep)]">さらに30品目表示</button>}
      {results.inferredGroups.length > 0 && <><p className="bg-[var(--sage-soft)] px-3 py-2 text-xs font-bold text-[var(--sage-deep)]">食材名からの推測候補</p>{results.inferredGroups.map(renderGroup)}</>}
      {resultCount === 0 && <p className="p-3 text-xs text-[var(--muted)]">該当する食品はありません。</p>}
    </div>}
    {activeGroup && <div className="mt-4 rounded-xl border border-[var(--sage-deep)] bg-white p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold text-[var(--sage-deep)]">選択した食品</p><p className="mt-1 break-words text-base font-bold leading-6 text-[var(--ink)]">{activeGroup.name}</p></div><button type="button" onClick={clearSelection} aria-label="食品の選択を閉じる" className="delete-button -mr-2 -mt-2 shrink-0"><Icon name="plus" className="size-4 rotate-45" /></button></div>
      {activeGroup.inferred && <p className="mt-2 text-sm leading-6 text-[var(--muted)]">検索語からの推測候補です。実際に食べた食品と栄養値を確認してから保存してください。</p>}
      {activeGroup.variants.length > 1 && <div className="mt-3">
        <p className="text-xs font-semibold text-[var(--ink)]">元データの品目を選択してください（{activeGroup.variants.length.toLocaleString()}件）</p>
        <p className="mt-1 text-xs leading-5 text-[var(--muted)]">調理法や食品番号ごとに栄養値が異なります。品目名と栄養値を確認してください。</p>
        <input type="search" aria-label="品目名または食品番号で候補を絞る" value={variantQuery} onChange={(event) => { setVariantQuery(event.target.value); setVisibleVariants(10); setSelectedFood(null); }} placeholder="品目名・食品番号で絞る" className="mt-2 h-12 w-full rounded border border-[var(--line)] px-3 text-base text-[var(--ink)] outline-none focus:border-[var(--sage-deep)]" />
        <div className="mt-2 max-h-64 overflow-y-auto overscroll-contain rounded border border-[var(--line)]">
          {variantResults.slice(0, visibleVariants).map((food) => <button key={food.id} type="button" aria-pressed={selectedFood?.id === food.id} onClick={() => chooseVariant(food)} className={`block w-full border-b border-[var(--line)] px-3 py-2.5 text-left last:border-b-0 ${selectedFood?.id === food.id ? "bg-[var(--sage-soft)]" : ""}`}>
            <span className="block break-words text-sm font-medium leading-6 text-[var(--ink)]">{detailLabel(food)}</span>
            <span className="mt-1 block text-xs leading-5 text-[var(--muted)]">{sourceLabel(food)}</span>
            <span className="metric mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--muted)]"><span className="font-semibold text-[var(--ink)]">{food.per100g.calories} kcal</span><span>P {food.per100g.proteinG}g</span><span>F {food.per100g.fatG}g</span><span>C {food.per100g.carbsG}g</span></span>
          </button>)}
        </div>
        {variantResults.length === 0 && <p className="mt-2 text-xs text-[var(--muted)]">一致する候補がありません。</p>}
        {variantResults.length > visibleVariants && <button type="button" onClick={() => setVisibleVariants((count) => count + 10)} className="text-link mt-2 underline underline-offset-2">さらに候補を表示</button>}
      </div>}
      {selectedFood ? <div className="mt-3 border-t border-[var(--line)] pt-3">
        <p className="text-xs font-bold text-[var(--ink)]">選択中：{selectedFood.name}</p>
        {selectedFood.foodCode && <p className="mt-2 text-xs text-[var(--muted)]">食品番号：{selectedFood.foodCode}</p>}
        <p className="mt-4 text-sm font-semibold text-[var(--ink)]">食べた量</p>
        <div className="mt-2 flex gap-2" role="group" aria-label="量の単位">{(["g", selectedFood.id === "schau-essen" ? "本" : "個"] as const).map((value) => <button key={value} type="button" aria-pressed={unit === value} onClick={() => { if (value === unit) return; setUnit(value); setQuantity(value === "g" ? grams : 1); }} className={`min-h-11 min-w-16 rounded border px-3 text-sm font-bold ${unit === value ? "border-[var(--sage-deep)] bg-[var(--sage-soft)] text-[var(--sage-deep)]" : "border-[var(--line)] bg-white text-[var(--muted)]"}`}>{value}</button>)}</div>
        <div className="mt-2 flex items-center gap-2"><input aria-label="食べた量" type="number" min="1" max={unit === "g" ? "3000" : "100"} step="1" inputMode="numeric" value={quantity || ""} onChange={(event) => setQuantity(event.target.value === "" ? 0 : Number(event.target.value))} className="form-input max-w-40" /><span className="text-sm text-[var(--muted)]">{unit}</span></div>
        {unit !== "g" && <label className="mt-3 block text-xs font-medium text-[var(--ink)]">1{unit}あたりの重さ（目安・変更可）<span className="mt-2 flex items-center gap-2"><input aria-label={`1${unit}あたりの重さ`} type="number" min="1" max="3000" step="1" inputMode="numeric" value={gramsPerPiece || ""} onChange={(event) => setGramsPerPiece(event.target.value === "" ? 0 : Number(event.target.value))} className="form-input max-w-40" /><span>g</span></span></label>}
        <p className="mt-2 text-xs text-[var(--muted)]">{unit !== "g" ? `${quantity}${unit} ≒ ${grams}g。大きさによって変わるため目安です。` : `1食分の目安：${selectedFood.suggestedGrams}g`}</p>
        {selectedFood.sourceUrl && <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{selectedFood.sourceDescription}</p>}
        {nutrition && <div className="mt-5 rounded-lg border border-[var(--line)] bg-[var(--sand)] p-5"><p className="text-xs font-bold text-[var(--ink)]">栄養情報 · 入力した量</p><div className="mt-4 flex flex-wrap items-start gap-6"><div className="metric min-w-20 border-l-2 border-[var(--sage-deep)] pl-3"><strong className="block text-2xl leading-none text-[var(--ink)]">{nutrition.calories}</strong><span className="mt-1 block text-[11px] text-[var(--muted)]">kcal</span></div><dl className="metric flex min-w-[155px] flex-1 flex-wrap gap-x-6 gap-y-3">{([ ["P", nutrition.proteinG], ["F", nutrition.fatG], ["C", nutrition.carbsG] ] as const).map(([label, value]) => <div key={label}><dt className="text-xs font-semibold text-[var(--muted)]">{label}</dt><dd className="mt-1 text-sm font-bold text-[var(--ink)]">{value}<span className="ml-0.5 text-xs font-normal text-[var(--muted)]">g</span></dd></div>)}</dl></div></div>}
        {!valid && <p className="mt-2 text-xs text-[var(--coral)]">量と1個あたりの重さを確認してください（合計3,000gまで）。</p>}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row"><Button type="button" className="flex-1" onClick={queueSelectedFood} disabled={!valid || isAdding}>{queuedFoods.some((item) => item.food.id === selectedFood.id) ? "選択中の量を更新" : "選択リストに追加"}</Button>{queuedFoods.length === 0 && <Button type="button" variant="secondary" className="flex-1" onClick={() => void addSelectedFood()} disabled={!valid || isAdding}>{isAdding ? "保存中…" : "この食品だけ保存"}</Button>}</div>
        <a href={sourceLink(selectedFood)} target="_blank" rel="noreferrer" className="text-link mt-1 underline underline-offset-2">栄養値の出典を見る</a>
      </div> : null}
    </div>}
    {saveNotice && <p role={saveNotice.error ? "alert" : "status"} aria-live="polite" className={`mt-4 flex items-center gap-2 rounded-lg px-3 py-3 text-sm font-semibold ${saveNotice.error ? "bg-[var(--coral-soft)] text-[var(--coral)]" : "bg-[var(--sage-soft)] text-[var(--sage-deep)]"}`}>{!saveNotice.error && <Icon name="check" className="size-4 shrink-0" />}{saveNotice.text}</p>}
    <details className="mt-4 text-xs leading-6 text-[var(--muted)]"><summary className="min-h-11 py-3">栄養データと出典について</summary><p className="mt-2">定番料理{library.foods.length}件・日本の食品成分表{catalogStatus === "loaded" ? extendedFoods.length.toLocaleString() : "約2,500"}件。表示値は可食部100gを基準に計算します。</p><p className="mt-2">詳細データの出典：<a href="https://www.mext.go.jp/a_menu/syokuhinseibun/mext_00001.html" target="_blank" rel="noreferrer" className="font-bold text-[var(--sage-deep)] underline underline-offset-2">日本食品標準成分表（八訂）増補2023年</a>。定番料理の一部は<a href={library.sourceUrl} target="_blank" rel="noreferrer" className="font-bold text-[var(--sage-deep)] underline underline-offset-2">米国農務省の食品データ</a>に基づきます。調理方法・商品によって値は変わります。</p></details>
  </section>;
}
