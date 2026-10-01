"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { searchFoodGroups } from "@/lib/food-catalog-groups.mjs";
import libraryJson from "@/lib/data/food-library.json";
import { foodToMealItem, type FoodLibraryDataset, type FoodLibraryItem } from "@/types/food-database";
import type { MealFoodItem } from "@/types/meal";

interface FoodLibrarySearchProps {
  onAddFood: (food: Omit<MealFoodItem, "id">) => void;
}

type FoodGroup = ReturnType<typeof searchFoodGroups>["groups"][number];

const library = libraryJson as FoodLibraryDataset;
const popularIds = ["rice", "natto", "miso-soup", "chicken-breast", "grilled-salmon", "ramen", "curry-rice", "banana"];
const popularFoods = popularIds.map((id) => library.foods.find((food) => food.id === id)).filter((food): food is FoodLibraryItem => Boolean(food));

function sourceLink(food: FoodLibraryItem): string {
  return food.foodCode ? "https://fooddb.mext.go.jp/" : `https://fdc.nal.usda.gov/food-search/?query=${food.fdcId}`;
}

function sourceLabel(food: FoodLibraryItem): string {
  return food.foodCode ? `文部科学省・食品番号 ${food.foodCode}` : "定番食品データ";
}

function detailLabel(food: FoodLibraryItem): string {
  return food.foodCode ? food.sourceDescription ?? food.name : food.name;
}

export function FoodLibrarySearch({ onAddFood }: FoodLibrarySearchProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("すべて");
  const [extendedFoods, setExtendedFoods] = useState<FoodLibraryItem[]>([]);
  const [catalogStatus, setCatalogStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [showAll, setShowAll] = useState(false);
  const [visibleCount, setVisibleCount] = useState(30);
  const [activeGroup, setActiveGroup] = useState<FoodGroup | null>(null);
  const [selectedFood, setSelectedFood] = useState<FoodLibraryItem | null>(null);
  const [variantQuery, setVariantQuery] = useState("");
  const [visibleVariants, setVisibleVariants] = useState(10);
  const [grams, setGrams] = useState(100);
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

  const showPopular = !query.trim() && category === "すべて" && !showAll;
  const results = useMemo(() => searchFoodGroups(showPopular ? popularFoods : allFoods, showPopular ? "" : query, category), [showPopular, allFoods, query, category]);
  const shownGroups = results.groups.slice(0, visibleCount);
  const variantResults = useMemo(() => {
    if (!activeGroup) return [];
    const needle = variantQuery.trim().toLocaleLowerCase();
    if (!needle) return activeGroup.variants;
    return activeGroup.variants.filter((food) => `${food.name} ${food.foodCode ?? food.fdcId ?? ""} ${food.foodCode ? food.sourceDescription ?? "" : ""}`.toLocaleLowerCase().includes(needle));
  }, [activeGroup, variantQuery]);
  const nutrition = selectedFood ? foodToMealItem(selectedFood, grams) : null;

  function chooseGroup(group: FoodGroup) {
    setActiveGroup(group);
    setVariantQuery("");
    setVisibleVariants(10);
    const onlyFood = group.variants.length === 1 ? group.variants[0] : null;
    setSelectedFood(onlyFood);
    if (onlyFood) setGrams(onlyFood.suggestedGrams);
  }

  function chooseVariant(food: FoodLibraryItem) {
    setSelectedFood(food);
    setGrams(food.suggestedGrams);
  }

  function addSelectedFood() {
    if (!selectedFood || !Number.isFinite(grams) || grams <= 0 || grams > 3000) return;
    onAddFood(foodToMealItem(selectedFood, grams));
    clearSelection();
    setQuery("");
  }

  return <section className="mt-5">
    <div className="flex items-start gap-3">
      <div><p className="text-sm font-bold text-[var(--ink)]">料理・食品を検索</p><p className="mt-0.5 text-xs leading-5 text-[var(--muted)]">料理名を検索して、食べた量を選んでください。</p></div>
    </div>
    <label className="mt-3 flex min-h-12 items-center gap-2 rounded border border-[var(--line)] bg-white px-3 py-2.5 focus-within:outline-2 focus-within:outline-[var(--sage-deep)]">
      <Icon name="search" className="size-4 shrink-0 text-[var(--muted)]" />
      <input type="search" aria-label="料理・食品を検索" value={query} onFocus={loadExtendedCatalog} onChange={(event) => { setQuery(event.target.value); setVisibleCount(30); clearSelection(); loadExtendedCatalog(); }} placeholder="例：白米、とりにく、カレーライス" className="min-w-0 flex-1 bg-transparent text-base text-[var(--ink)] outline-none placeholder:text-[#a6ada9]" />
    </label>
    <p className="mt-1.5 text-[10px] text-[var(--muted)]">ひらがな・カタカナ、別名でも検索できます。</p>
    <select aria-label="食品のカテゴリ" value={category} onChange={(event) => { setCategory(event.target.value); setVisibleCount(30); clearSelection(); loadExtendedCatalog(); }} className="mt-2 h-12 w-full rounded border border-[var(--line)] bg-white px-3 text-base font-semibold text-[var(--ink)] outline-none">{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select>
    {(catalogStatus === "idle" || catalogStatus === "error") && <button type="button" onClick={() => { setShowAll(true); setVisibleCount(30); loadExtendedCatalog(); }} className="text-link mt-1 underline underline-offset-2">{catalogStatus === "error" ? "詳細データを再読み込み" : "日本の食品成分表を読み込む"}</button>}
    {catalogStatus === "loaded" && !showAll && <button type="button" onClick={() => { setShowAll(true); clearSelection(); }} className="text-link mt-1 underline underline-offset-2">全食品の一覧を見る</button>}
    {catalogStatus === "loading" && <p className="mt-3 text-xs text-[var(--muted)]" role="status">詳細データを読み込み中…</p>}
    {catalogStatus === "loaded" && <p className="mt-3 text-[10px] leading-4 text-[var(--muted)]">同じ日本語名の食品は1行にまとめています。部位や調理法で栄養が異なる場合は、追加前に候補を選んでください。</p>}
    {results.usedFuzzy && <p className="mt-3 rounded-lg bg-white px-3 py-2 text-xs text-[var(--sage-deep)]" role="status">入力に近い候補を表示しています。品目を確認してから追加してください。</p>}
    <p className="mt-3 text-[10px] font-bold tracking-wide text-[var(--muted)]">{showPopular ? "よく使う食品" : `検索結果 ${results.groups.length.toLocaleString()}品目（元データ ${results.matchingRecords.toLocaleString()}件・${shownGroups.length.toLocaleString()}品目を表示）`}</p>
    {shownGroups.length ? <div className="mt-2 max-h-72 overflow-y-auto rounded border border-[var(--line)] bg-white">
      {shownGroups.map((group) => {
        const single = group.variants.length === 1 ? group.variants[0] : null;
        return <button key={group.name} type="button" onClick={() => chooseGroup(group)} className={`flex w-full flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-3 py-3 text-left last:border-b-0 hover:bg-[#fafbf9] ${activeGroup?.name === group.name ? "bg-[var(--sage-soft)]" : ""}`}>
          <div className="min-w-0"><p className="text-sm font-bold text-[var(--ink)]">{group.name}</p><p className="mt-1 text-[10px] text-[var(--muted)]">{single ? `${single.category} · ${sourceLabel(single)}` : `${group.variants.length.toLocaleString()}件の候補から選択`}</p></div>
          <div className="shrink-0 text-right">{single ? <><p className="text-xs font-bold text-[var(--sage-deep)]">{single.per100g.calories} kcal</p><p className="mt-1 text-[10px] font-medium text-[var(--muted)]">P {single.per100g.proteinG} / F {single.per100g.fatG} / C {single.per100g.carbsG}</p></> : <span className="text-xs font-bold text-[var(--sage-deep)]">候補を見る ›</span>}</div>
        </button>;
      })}
    </div> : <p className="mt-3 text-xs text-[var(--muted)]">{catalogStatus === "loading" ? "詳細データの読み込み後に再度検索します。" : "見つかりませんでした。別名や短い料理名でも検索してみてください。"}</p>}
    {results.groups.length > shownGroups.length && <button type="button" onClick={() => setVisibleCount((count) => count + 30)} className="mt-3 min-h-11 w-full rounded border border-[var(--line)] bg-white px-3 py-2.5 text-xs font-bold text-[var(--sage-deep)]">さらに30品目表示</button>}
    {activeGroup && <div className="mt-3 rounded bg-white p-3">
      <p className="text-sm font-bold text-[var(--ink)]">{activeGroup.name}</p>
      {activeGroup.variants.length > 1 && <div className="mt-3">
        <p className="text-xs font-semibold text-[var(--ink)]">元データの品目を選択してください（{activeGroup.variants.length.toLocaleString()}件）</p>
        <p className="mt-1 text-[10px] leading-4 text-[var(--muted)]">調理法や食品番号ごとに栄養値が異なります。日本語の品目名と栄養値を確認してください。</p>
        <input type="search" aria-label="品目名または食品番号で候補を絞る" value={variantQuery} onChange={(event) => { setVariantQuery(event.target.value); setVisibleVariants(10); setSelectedFood(null); }} placeholder="品目名・食品番号で絞る" className="mt-2 h-12 w-full rounded border border-[var(--line)] px-3 text-base text-[var(--ink)] outline-none focus:border-[var(--sage-deep)]" />
        <div className="mt-2 max-h-56 overflow-y-auto rounded border border-[var(--line)]">
          {variantResults.slice(0, visibleVariants).map((food) => <button key={food.id} type="button" aria-pressed={selectedFood?.id === food.id} onClick={() => chooseVariant(food)} className={`block w-full border-b border-[var(--line)] px-3 py-2.5 text-left last:border-b-0 ${selectedFood?.id === food.id ? "bg-[var(--sage-soft)]" : ""}`}>
            <span className="block text-xs font-medium leading-5 text-[var(--ink)]">{detailLabel(food)}</span>
            <span className="mt-0.5 block text-[10px] text-[var(--muted)]">{food.category} · {sourceLabel(food)} · {food.per100g.calories} kcal / 100g · P {food.per100g.proteinG} / F {food.per100g.fatG} / C {food.per100g.carbsG}</span>
          </button>)}
        </div>
        {variantResults.length === 0 && <p className="mt-2 text-xs text-[var(--muted)]">一致する候補がありません。</p>}
        {variantResults.length > visibleVariants && <button type="button" onClick={() => setVisibleVariants((count) => count + 10)} className="text-link mt-2 underline underline-offset-2">さらに候補を表示</button>}
      </div>}
      {selectedFood && nutrition ? <div className="mt-3 border-t border-[var(--line)] pt-3">
        <p className="text-xs font-bold text-[var(--ink)]">選択中：{selectedFood.name}</p>
        {selectedFood.foodCode && <p className="mt-2 text-[11px] text-[var(--muted)]">食品番号：{selectedFood.foodCode}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2"><label htmlFor="food-portion-grams" className="shrink-0 text-xs font-bold text-[var(--ink)]">食べた量</label><input id="food-portion-grams" type="number" min="1" max="3000" step="1" inputMode="numeric" value={grams || ""} onChange={(event) => setGrams(Number(event.target.value))} className="form-input h-11 w-24" /><span className="text-xs text-[var(--muted)]">g（初期目安 {selectedFood.suggestedGrams}g）</span></div>
        <p className="mt-3 text-xs font-bold text-[var(--ink)]">{nutrition.calories} kcal · P {nutrition.proteinG}g / F {nutrition.fatG}g / C {nutrition.carbsG}g</p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><a href={sourceLink(selectedFood)} target="_blank" rel="noreferrer" className="text-link underline underline-offset-2">出典を見る{selectedFood.foodCode ? `（食品番号 ${selectedFood.foodCode}）` : ""}</a><Button type="button" onClick={addSelectedFood} disabled={!Number.isFinite(grams) || grams <= 0 || grams > 3000}>この食品を追加</Button></div>
      </div> : null}
    </div>}
    <details className="mt-4 text-[11px] leading-6 text-[var(--muted)]"><summary className="min-h-11 py-3">栄養データと出典について</summary><p className="mt-2">定番料理{library.foods.length}件・日本の食品成分表{catalogStatus === "loaded" ? extendedFoods.length.toLocaleString() : "約2,500"}件。表示値は可食部100gを基準に計算します。</p><p className="mt-2">詳細データの出典：<a href="https://www.mext.go.jp/a_menu/syokuhinseibun/mext_00001.html" target="_blank" rel="noreferrer" className="font-bold text-[var(--sage-deep)] underline underline-offset-2">日本食品標準成分表（八訂）増補2023年</a>。定番料理の一部は<a href={library.sourceUrl} target="_blank" rel="noreferrer" className="font-bold text-[var(--sage-deep)] underline underline-offset-2">米国農務省の食品データ</a>に基づきます。調理方法・商品によって値は変わります。</p></details>
  </section>;
}
