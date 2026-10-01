"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/form-fields";
import { Icon } from "@/components/ui/icon";
import { exerciseCatalog, exerciseCount } from "@/lib/data/exercise-catalog";

interface ExercisePickerProps {
  onSelect: (exerciseName: string) => void;
}

export function ExercisePicker({ onSelect }: ExercisePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("すべて");
  const normalizedQuery = query.trim().toLocaleLowerCase();

  const results = useMemo(() => exerciseCatalog
    .filter((category) => activeCategory === "すべて" || category.label === activeCategory)
    .map((category) => ({
      ...category,
      groups: category.groups.map((group) => ({
        ...group,
        exercises: group.exercises.filter((exercise) => exercise.toLocaleLowerCase().includes(normalizedQuery)),
      })).filter((group) => group.exercises.length),
    }))
    .filter((category) => category.groups.length), [activeCategory, normalizedQuery]);

  function choose(exerciseName: string) {
    onSelect(exerciseName);
    setIsOpen(false);
    setQuery("");
  }

  return <>
    <Button type="button" variant="secondary" size="small" className="mt-2 w-full border-dashed text-[var(--sage-deep)]" onClick={() => setIsOpen(true)}><Icon name="dumbbell" className="size-4" />種目メニューから選択</Button>
    {isOpen ? <div className="fixed inset-0 z-50 flex items-end bg-black/30 p-0 sm:items-center sm:justify-center sm:p-5" role="dialog" aria-modal="true" aria-label="筋トレ種目を選択">
      <section className="flex max-h-[88dvh] w-full max-w-xl flex-col rounded-t-[28px] bg-[var(--canvas)] shadow-2xl sm:rounded-[28px]">
        <header className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4"><div><p className="text-sm font-bold text-[var(--ink)]">種目を選択</p><p className="mt-0.5 text-[11px] text-[var(--muted)]">{exerciseCount}種目から検索できます</p></div><button type="button" onClick={() => setIsOpen(false)} className="grid size-9 place-items-center rounded-xl bg-[var(--sand)] text-xl leading-none text-[var(--muted)]" aria-label="種目メニューを閉じる">×</button></header>
        <div className="border-b border-[var(--line)] px-5 py-4"><TextInput type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="種目名を検索 例：ベンチプレス" autoFocus /><div className="mt-3 flex gap-2 overflow-x-auto pb-1">{["すべて", ...exerciseCatalog.map((category) => category.label)].map((category) => <button key={category} type="button" onClick={() => setActiveCategory(category)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition ${activeCategory === category ? "bg-[var(--sage-deep)] text-white" : "bg-white text-[var(--muted)] ring-1 ring-[var(--line)]"}`}>{category}</button>)}</div></div>
        <div className="min-h-0 overflow-y-auto px-5 py-4">{results.length ? <div className="space-y-6">{results.map((category) => <section key={category.label}><h2 className="text-sm font-bold text-[var(--ink)]">{category.label}</h2><div className="mt-3 space-y-4">{category.groups.map((group) => <div key={group.label}><p className="mb-2 text-[11px] font-bold tracking-[0.06em] text-[var(--sage-deep)]">{group.label}</p><div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white">{group.exercises.map((exercise, index) => <button key={exercise} type="button" onClick={() => choose(exercise)} className={`flex min-h-14 w-full items-center gap-3 px-4 text-left transition hover:bg-[var(--sage-soft)] ${index ? "border-t border-[var(--line)]" : ""}`}><span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[var(--sand)] text-[var(--sage-deep)]"><Icon name="dumbbell" className="size-3.5" /></span><span className="min-w-0 flex-1 text-sm font-semibold text-[var(--ink)]">{exercise}</span><span className="text-[11px] font-bold text-[var(--muted)]">{category.label}</span><Icon name="chevron-right" className="size-4 shrink-0 text-[#aab0ac]" /></button>)}</div></div>)}</div></section>)}</div> : <div className="py-14 text-center"><Icon name="dumbbell" className="mx-auto size-6 text-[#a6ada8]" /><p className="mt-3 text-sm font-semibold text-[var(--ink)]">該当する種目がありません</p><p className="mt-1 text-xs text-[var(--muted)]">種目名を変えて検索してください。</p></div>}</div>
      </section>
    </div> : null}
  </>;
}
