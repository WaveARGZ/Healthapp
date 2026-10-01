"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase();

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    // Focus the close control on phones so opening the list does not open the keyboard.
    const initialFocus = window.matchMedia("(min-width: 640px)").matches
      ? dialogRef.current?.querySelector<HTMLInputElement>('input[type="search"]')
      : dialogRef.current?.querySelector<HTMLButtonElement>("button");
    initialFocus?.focus();
    document.body.style.overflow = "hidden";
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); setIsOpen(false); }
      if (event.key !== "Tab") return;
      const controls = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]');
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKey);
      openerRef.current?.focus();
    };
  }, [isOpen]);

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
    <Button type="button" variant="secondary" size="small" className="mt-2 w-full text-[var(--sage-deep)]" onClick={(event) => { openerRef.current = event.currentTarget; setIsOpen(true); }}><Icon name="dumbbell" className="size-4" />種目一覧から選ぶ</Button>
    {isOpen ? <div ref={dialogRef} className="exercise-dialog" role="dialog" aria-modal="true" aria-label="筋トレ種目を選択" onClick={(event) => { if (event.target === event.currentTarget) setIsOpen(false); }}>
      <section className="exercise-dialog-panel">
        <header className="flex shrink-0 items-center justify-between border-b border-[var(--line)] px-5 py-4"><div><p className="text-sm font-bold text-[var(--ink)]">種目を選択</p><p className="mt-0.5 text-[11px] text-[var(--muted)]">{exerciseCount}種目から検索できます</p></div><button type="button" onClick={() => setIsOpen(false)} className="grid size-11 place-items-center rounded bg-[var(--sand)] text-xl leading-none text-[var(--muted)]" aria-label="種目メニューを閉じる">×</button></header>
        <div className="shrink-0 border-b border-[var(--line)] px-5 py-3"><TextInput type="search" aria-label="種目名を検索" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="種目名を検索 例：ベンチプレス" /><div className="mt-3 flex gap-2 overflow-x-auto pb-1">{["すべて", ...exerciseCatalog.map((category) => category.label)].map((category) => <button key={category} type="button" onClick={() => setActiveCategory(category)} aria-pressed={activeCategory === category} className={`min-h-11 shrink-0 rounded px-4 py-2 text-xs font-bold transition ${activeCategory === category ? "bg-[var(--sage-deep)] text-white" : "bg-white text-[var(--muted)] ring-1 ring-[var(--line)]"}`}>{category}</button>)}</div></div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-4 pb-[max(16px,env(safe-area-inset-bottom))]">{results.length ? <div className="space-y-6">{results.map((category) => <section key={category.label}><h2 className="text-sm font-bold text-[var(--ink)]">{category.label}</h2><div className="mt-3 space-y-4">{category.groups.map((group) => <div key={group.label}><p className="mb-2 text-[11px] font-bold tracking-[0.06em] text-[var(--sage-deep)]">{group.label}</p><div className="overflow-hidden rounded-md border border-[var(--line)] bg-white">{group.exercises.map((exercise, index) => <button key={exercise} type="button" onClick={() => choose(exercise)} className={`flex min-h-14 w-full items-center gap-3 px-4 text-left transition hover:bg-[var(--sage-soft)] ${index ? "border-t border-[var(--line)]" : ""}`}><span className="grid size-6 shrink-0 place-items-center text-[var(--muted)]"><Icon name="dumbbell" className="size-3.5" /></span><span className="min-w-0 flex-1 text-sm font-semibold text-[var(--ink)]">{exercise}</span><span className="text-[11px] font-bold text-[var(--muted)]">{category.label}</span><Icon name="chevron-right" className="size-4 shrink-0 text-[#aab0ac]" /></button>)}</div></div>)}</div></section>)}</div> : <div className="py-14 text-center"><Icon name="dumbbell" className="mx-auto size-6 text-[#a6ada8]" /><p className="mt-3 text-sm font-semibold text-[var(--ink)]">該当する種目がありません</p><p className="mt-1 text-xs text-[var(--muted)]">種目名を変えて検索してください。</p></div>}</div>
      </section>
    </div> : null}
  </>;
}
