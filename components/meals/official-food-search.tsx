"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { officialFoodToMealItem, type OfficialFood, type OfficialFoodDataset } from "@/types/food-database";
import type { MealFoodItem } from "@/types/meal";

interface OfficialFoodSearchProps {
  onAddFood: (food: Omit<MealFoodItem, "id">) => void;
}

function foodDataUrl(): string {
  const manifestHref = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.href;
  return new URL("data/mext-foods-2023.json", manifestHref ?? `${window.location.origin}/`).toString();
}

function formatValue(value: number | undefined): string {
  return value === undefined ? "--" : String(value);
}

export function OfficialFoodSearch({ onAddFood }: OfficialFoodSearchProps) {
  const [query, setQuery] = useState("");
  const [foods, setFoods] = useState<OfficialFood[]>([]);
  const [dataset, setDataset] = useState<Pick<OfficialFoodDataset, "basis" | "sourceName" | "sourceUrl"> | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch(foodDataUrl())
      .then((response) => {
        if (!response.ok) throw new Error("食品データを取得できませんでした。");
        return response.json() as Promise<OfficialFoodDataset>;
      })
      .then((result) => {
        if (!active) return;
        setFoods(result.foods);
        setDataset({ basis: result.basis, sourceName: result.sourceName, sourceUrl: result.sourceUrl });
      })
      .catch(() => {
        if (active) setLoadError(true);
      });
    return () => { active = false; };
  }, []);

  const results = useMemo(() => {
    const normalizedQuery = query.trim().replaceAll("　", " ").toLocaleLowerCase();
    if (!normalizedQuery) return [];
    return foods.filter((food) => `${food.name} ${food.group} ${food.code}`.toLocaleLowerCase().includes(normalizedQuery)).slice(0, 8);
  }, [foods, query]);

  return <section className="mt-5 rounded-2xl border border-[var(--line)] bg-[var(--sage-soft)]/55 p-4">
    <div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-[var(--sage-deep)] shadow-sm"><Icon name="search" className="size-4" /></span><div><p className="text-sm font-bold text-[var(--ink)]">食品データベースから追加</p><p className="mt-0.5 text-xs leading-5 text-[var(--muted)]">公式成分表の食品を検索して、栄養値を自動入力します。</p></div></div>
    <label className="mt-3 flex items-center gap-2 rounded-xl border border-white bg-white px-3 py-2.5 shadow-sm"><Icon name="search" className="size-4 text-[var(--muted)]" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例：ごはん、鶏肉、納豆" className="min-w-0 flex-1 bg-transparent text-sm text-[var(--ink)] outline-none placeholder:text-[#a6ada9]" /></label>
    {!foods.length && !loadError ? <p className="mt-3 text-xs text-[var(--muted)]">公式食品データを読み込んでいます…</p> : null}
    {loadError ? <p className="mt-3 text-xs leading-5 text-[var(--coral)]">食品データを読み込めませんでした。通信を確認して再読み込みしてください。</p> : null}
    {results.length ? <div className="mt-3 overflow-hidden rounded-xl border border-white bg-white">{results.map((food) => <button key={food.code} type="button" onClick={() => { onAddFood(officialFoodToMealItem(food)); setQuery(""); }} className="flex w-full items-center justify-between gap-3 border-b border-[var(--line)] px-3 py-3 text-left last:border-b-0 hover:bg-[#fafbf9]"><div className="min-w-0"><p className="truncate text-sm font-bold text-[var(--ink)]">{food.name}</p><p className="mt-1 text-[10px] text-[var(--muted)]">{food.group} · 可食部100g</p></div><div className="shrink-0 text-right"><p className="text-xs font-bold text-[var(--sage-deep)]">{food.calories} kcal</p><p className="mt-1 text-[10px] font-medium text-[var(--muted)]">P {formatValue(food.proteinG)} / F {formatValue(food.fatG)} / C {formatValue(food.carbsG)}</p></div></button>)}</div> : null}
    {query.trim() && foods.length && !results.length ? <p className="mt-3 text-xs text-[var(--muted)]">該当する食品がありません。料理名を短くして検索してみてください。</p> : null}
    {dataset ? <p className="mt-3 text-[10px] leading-4 text-[var(--muted)]">{dataset.basis} · <a href={dataset.sourceUrl} target="_blank" rel="noreferrer" className="font-bold text-[var(--sage-deep)] underline underline-offset-2">{dataset.sourceName}</a></p> : null}
  </section>;
}
