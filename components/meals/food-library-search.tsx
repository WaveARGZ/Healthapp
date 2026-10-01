"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import libraryJson from "@/lib/data/food-library.json";
import { foodToMealItem, type FoodLibraryDataset, type FoodLibraryItem } from "@/types/food-database";
import type { MealFoodItem } from "@/types/meal";

interface FoodLibrarySearchProps {
  onAddFood: (food: Omit<MealFoodItem, "id">) => void;
}

const library = libraryJson as FoodLibraryDataset;
const popularIds = ["rice", "natto", "miso-soup", "chicken-breast", "grilled-salmon", "ramen", "curry-rice", "banana"];

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[\s・（）()、,]/g, "");
}

function sourceLink(food: FoodLibraryItem): string {
  return `https://fdc.nal.usda.gov/food-search/?query=${food.fdcId}`;
}

export function FoodLibrarySearch({ onAddFood }: FoodLibrarySearchProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("すべて");
  const [extendedFoods, setExtendedFoods] = useState<FoodLibraryItem[]>([]);
  const [catalogStatus, setCatalogStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [showAll, setShowAll] = useState(false);
  const [visibleCount, setVisibleCount] = useState(30);
  const [selectedFood, setSelectedFood] = useState<FoodLibraryItem | null>(null);
  const [grams, setGrams] = useState(100);
  const loadingCatalog = useRef<Promise<void> | null>(null);

  const categories = useMemo(() => ["すべて", ...new Set([...library.foods, ...extendedFoods].map((food) => food.category))], [extendedFoods]);

  function loadExtendedCatalog() {
    if (loadingCatalog.current || catalogStatus === "loaded") return;
    setCatalogStatus("loading");
    const url = new URL("../data/food-library-extended.json", window.location.href);
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

  const results = useMemo(() => {
    const tokens = query.trim().split(/\s+/).map(normalize).filter(Boolean);
    if (!tokens.length && category === "すべて" && !showAll) {
      const popular = popularIds.map((id) => library.foods.find((food) => food.id === id)).filter((food): food is FoodLibraryItem => Boolean(food));
      return { foods: popular, total: popular.length };
    }
    const filtered = [...library.foods, ...extendedFoods].filter((food) =>
      (category === "すべて" || food.category === category) &&
      tokens.every((token) => normalize(`${food.name} ${food.aliases} ${food.sourceDescription ?? ""}`).includes(token)),
    );
    return { foods: filtered.slice(0, visibleCount), total: filtered.length };
  }, [query, category, extendedFoods, showAll, visibleCount]);

  const nutrition = selectedFood ? foodToMealItem(selectedFood, grams) : null;

  function chooseFood(food: FoodLibraryItem) {
    setSelectedFood(food);
    setGrams(food.suggestedGrams);
  }

  function addSelectedFood() {
    if (!selectedFood || !Number.isFinite(grams) || grams <= 0 || grams > 3000) return;
    onAddFood(foodToMealItem(selectedFood, grams));
    setSelectedFood(null);
    setQuery("");
  }

  return <section className="mt-5 rounded-2xl border border-[var(--line)] bg-[var(--sage-soft)]/55 p-4">
    <div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-[var(--sage-deep)] shadow-sm"><Icon name="search" className="size-4" /></span><div><p className="text-sm font-bold text-[var(--ink)]">料理・食品を検索</p><p className="mt-0.5 text-xs leading-5 text-[var(--muted)]">日本語の定番{library.foods.length}件とUSDAの詳細データ{catalogStatus === "loaded" ? extendedFoods.length.toLocaleString() : "約13,000"}件。100gの値からPFCを計算します。</p></div></div>
    <label className="mt-3 flex items-center gap-2 rounded-xl border border-white bg-white px-3 py-2.5 shadow-sm"><Icon name="search" className="size-4 text-[var(--muted)]" /><input type="search" value={query} onFocus={loadExtendedCatalog} onChange={(event) => { setQuery(event.target.value); setVisibleCount(30); loadExtendedCatalog(); }} placeholder="ごはん、カレー、鶏肉、納豆…" className="min-w-0 flex-1 bg-transparent text-sm text-[var(--ink)] outline-none placeholder:text-[#a6ada9]" /></label>
    <select aria-label="食品のカテゴリ" value={category} onChange={(event) => { setCategory(event.target.value); setVisibleCount(30); loadExtendedCatalog(); }} className="mt-2 h-10 w-full rounded-xl border border-white bg-white px-3 text-xs font-semibold text-[var(--ink)] outline-none">{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select>
    {catalogStatus === "idle" || catalogStatus === "error" ? <button type="button" onClick={() => { setShowAll(true); setVisibleCount(30); loadExtendedCatalog(); }} className="mt-3 text-xs font-bold text-[var(--sage-deep)] underline underline-offset-2">{catalogStatus === "error" ? "詳細データを再読み込み" : "USDAの全食品データを読み込む"}</button> : null}
    {catalogStatus === "loaded" && !showAll ? <button type="button" onClick={() => setShowAll(true)} className="mt-3 text-xs font-bold text-[var(--sage-deep)] underline underline-offset-2">全食品の一覧を見る</button> : null}
    {catalogStatus === "loading" ? <p className="mt-3 text-xs text-[var(--muted)]" role="status">詳細データを読み込み中…</p> : null}
    {catalogStatus === "loaded" ? <p className="mt-3 text-[10px] leading-4 text-[var(--muted)]">詳細データの料理名はUSDAの英語原文です。日本語のキーワードでも一部検索できます。</p> : null}
    <p className="mt-3 text-[10px] font-bold tracking-wide text-[var(--muted)]">{query.trim() || category !== "すべて" || showAll ? `検索結果 ${results.total.toLocaleString()}件（${results.foods.length.toLocaleString()}件を表示）` : "よく使う食品"}</p>
    {results.foods.length ? <div className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-white bg-white">{results.foods.map((food) => <button key={food.id} type="button" onClick={() => chooseFood(food)} className={`flex w-full items-center justify-between gap-3 border-b border-[var(--line)] px-3 py-3 text-left last:border-b-0 hover:bg-[#fafbf9] ${selectedFood?.id === food.id ? "bg-[var(--sage-soft)]" : ""}`}><div className="min-w-0"><p className="text-sm font-bold text-[var(--ink)]">{food.name}</p><p className="mt-1 text-[10px] text-[var(--muted)]">{food.category} · {food.sourceDataset}{food.id.startsWith("fdc-") ? " · 英語原文" : ""}</p></div><div className="shrink-0 text-right"><p className="text-xs font-bold text-[var(--sage-deep)]">{food.per100g.calories} kcal</p><p className="mt-1 text-[10px] font-medium text-[var(--muted)]">P {food.per100g.proteinG} / F {food.per100g.fatG} / C {food.per100g.carbsG}</p></div></button>)}</div> : <p className="mt-3 text-xs text-[var(--muted)]">見つかりませんでした。短い料理名でも検索してみてください。</p>}
    {results.total > results.foods.length ? <button type="button" onClick={() => setVisibleCount((count) => count + 30)} className="mt-3 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-xs font-bold text-[var(--sage-deep)]">さらに30件表示</button> : null}
    {selectedFood && nutrition ? <div className="mt-3 rounded-xl bg-white p-3"><p className="text-sm font-bold text-[var(--ink)]">{selectedFood.name}</p><p className="mt-1 text-[11px] text-[var(--muted)]">{selectedFood.id.startsWith("fdc-") ? "USDAの原文名です。日本の商品・調理法とは異なる場合があります。" : selectedFood.sourceDescription}</p><div className="mt-3 flex items-center gap-2"><label htmlFor="food-portion-grams" className="shrink-0 text-xs font-bold text-[var(--ink)]">食べた量</label><input id="food-portion-grams" type="number" min="1" max="3000" step="1" inputMode="numeric" value={grams || ""} onChange={(event) => setGrams(Number(event.target.value))} className="h-10 w-24 rounded-xl border border-[var(--line)] px-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--sage-deep)]" /><span className="text-xs text-[var(--muted)]">g（初期目安 {selectedFood.suggestedGrams}g）</span></div><p className="mt-3 text-xs font-bold text-[var(--ink)]">{nutrition.calories} kcal · P {nutrition.proteinG}g / F {nutrition.fatG}g / C {nutrition.carbsG}g</p><div className="mt-3 flex items-center justify-between gap-2"><a href={sourceLink(selectedFood)} target="_blank" rel="noreferrer" className="text-[10px] font-semibold text-[var(--sage-deep)] underline underline-offset-2">元データを見る（FDC {selectedFood.fdcId}）</a><Button type="button" onClick={addSelectedFood} disabled={!Number.isFinite(grams) || grams <= 0 || grams > 3000}>この食品を追加</Button></div></div> : null}
    <p className="mt-3 text-[10px] leading-4 text-[var(--muted)]">出典：<a href={library.sourceUrl} target="_blank" rel="noreferrer" className="font-bold text-[var(--sage-deep)] underline underline-offset-2">{library.sourceName}</a>（{library.license}）。調理方法・商品によって値は変わります。</p>
  </section>;
}
