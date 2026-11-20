"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { WorkoutSetNumberField } from "@/components/workouts/workout-set-number-field";
import type { WorkoutSet } from "@/types/workout";

interface WorkoutSetEditorProps {
  exerciseName: string;
  sets: WorkoutSet[];
  onUpdateSet: (setId: string, patch: Partial<WorkoutSet>) => void;
  onAddSet: () => void;
  onRemoveSet: (setId: string) => void;
  onBack: () => void;
}

const keypadQuery = "(max-width: 639px), (pointer: coarse)";
const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
const setFields = [
  { key: "weightKg", label: "重量", unit: "kg", step: "0.5" },
  { key: "reps", label: "レップ数", unit: "", step: "1" },
] as const;

type SetField = (typeof setFields)[number]["key"];
type ActiveField = { setId: string; key: SetField; value: string; replaceOnType: boolean };

function subscribeToKeypadMode(change: () => void) {
  const media = window.matchMedia(keypadQuery);
  media.addEventListener("change", change);
  return () => media.removeEventListener("change", change);
}

function usesNumberPad() {
  return window.matchMedia(keypadQuery).matches;
}

function revealSetControl(scroller: HTMLElement, field: HTMLElement) {
  const { top, bottom } = field.getBoundingClientRect();
  const bounds = scroller.getBoundingClientRect();
  const margin = 8;
  if (top < bounds.top + margin) scroller.scrollTop += top - bounds.top - margin;
  else if (bottom > bounds.bottom - margin) scroller.scrollTop += bottom - bounds.bottom + margin;
}

export function WorkoutSetEditor({ exerciseName, sets, onUpdateSet, onAddSet, onRemoveSet, onBack }: WorkoutSetEditorProps) {
  const keypadMode = useSyncExternalStore(subscribeToKeypadMode, usesNumberPad, () => false);
  const [selected, setSelected] = useState<ActiveField | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const selectedIndex = sets.findIndex((set) => set.id === selected?.setId);
  const active = keypadMode && selectedIndex >= 0 ? selected : null;
  const activeSetId = active?.setId;
  const activeKey = active?.key;
  const isFinalField = selectedIndex === sets.length - 1 && activeKey === "reps";

  useLayoutEffect(() => {
    if (!activeSetId || !activeKey) return;
    const scroller = scrollerRef.current;
    const field = scroller?.querySelector<HTMLButtonElement>('[data-workout-set-field][aria-pressed="true"]');
    if (!scroller || !field) return;

    // Reveal only the selected row. Browser focus scrolling can pan the entire screen.
    field.focus({ preventScroll: true });
    revealSetControl(scroller, field);
  }, [activeSetId, activeKey]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const observer = new ResizeObserver(() => {
      const note = scroller.querySelector<HTMLTextAreaElement>("[data-workout-set-note]:focus");
      if (note) revealSetControl(scroller, note);
    });
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  function selectField(set: WorkoutSet, key: SetField) {
    if (active?.setId === set.id && active.key === key) return;
    setSelected({ setId: set.id, key, value: String(set[key] ?? ""), replaceOnType: true });
  }

  function applyKey(key: string) {
    if (!active) return;
    if (key === "Enter") {
      if (active.key === "weightKg") selectField(sets[selectedIndex], "reps");
      else if (!isFinalField) selectField(sets[selectedIndex + 1], "weightKg");
      else {
        // The confirmation key will disappear. Return focus to the last field.
        scrollerRef.current?.querySelector<HTMLButtonElement>('[data-workout-set-field][aria-pressed="true"]')?.focus({ preventScroll: true });
        setSelected(null);
      }
      return;
    }

    const current = active.replaceOnType ? "" : active.value;
    let value: string;
    if (key === "Backspace") value = active.value.slice(0, -1);
    else if (key === ".") {
      if (active.key === "reps" || current.includes(".")) return;
      value = `${current || "0"}.`;
    } else value = `${current === "0" ? "" : current}${key}`;

    const number = value === "" ? undefined : Number(value);
    if (number !== undefined && (!Number.isFinite(number) || (active.key === "reps" && !Number.isSafeInteger(number)))) return;
    setSelected({ ...active, value, replaceOnType: false });
    onUpdateSet(active.setId, { [active.key]: number });
  }

  function handleFieldKey(event: KeyboardEvent<HTMLDivElement>) {
    if (!active || !(event.target instanceof HTMLButtonElement) || event.target.getAttribute("aria-pressed") !== "true") return;
    if (event.altKey || event.ctrlKey || event.metaKey || !/^(\d|\.|Enter|Backspace)$/.test(event.key)) return;
    event.preventDefault();
    applyKey(event.key);
  }

  return <>
    <div ref={scrollerRef} className="exercise-dialog-scroll workout-set-scroll min-h-0 flex-1" onKeyDown={handleFieldKey}>
      <section data-workout-set-editor aria-label={`${exerciseName}のセット入力`} className="px-4 py-5 sm:px-5">
        <button type="button" onClick={onBack} className="mb-2 min-h-11 text-sm font-semibold text-[var(--sage-deep)] underline underline-offset-2">← 種目選択へ戻る</button>
        <h2 className="text-base font-bold text-[var(--ink)]">{exerciseName}</h2>
        <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
          {keypadMode ? "入力欄を選び、✓で次の欄へ。" : "Enterで次の欄へ。"} 入力後は記録画面で保存してください。
        </p>
        <div className="mt-4 overflow-hidden rounded-lg border border-[var(--line)] bg-white">
          <div className="workout-set-row border-b border-[var(--line)] bg-[var(--sand)] py-2 text-center text-xs font-semibold text-[var(--muted)]">
            <span>#</span><span>重量 kg</span><span>レップ数</span><span className="sr-only">削除</span>
          </div>
          <div className="divide-y divide-[var(--line)]">
            {sets.map((set, index) => <div key={set.id} className="workout-set-row py-2">
              <span className="metric text-center text-xs font-semibold text-[var(--muted)]">{index + 1}</span>
              {setFields.map(({ key, label, unit, step }) => {
                const isActive = active?.setId === set.id && active.key === key;
                return <WorkoutSetNumberField
                  key={key}
                  autoFocusTarget={key === "weightKg"}
                  lastField={key === "reps" && index === sets.length - 1}
                  value={set[key]}
                  onCommit={(value) => {
                    if (isActive) setSelected({ ...active, value: String(value ?? ""), replaceOnType: true });
                    onUpdateSet(set.id, { [key]: value });
                  }}
                  previousValue={sets[index - 1]?.[key]}
                  label={`セット${index + 1}の${label}${unit ? ` ${unit}` : ""}`}
                  copyLabel={index > 0 ? `セット${index}の${label}をセット${index + 1}にコピー` : undefined}
                  step={step}
                  touchField={keypadMode ? {
                    active: isActive,
                    value: isActive ? active.value : String(set[key] ?? ""),
                    onSelect: () => selectField(set, key),
                  } : undefined}
                />;
              })}
              <button type="button" disabled={sets.length === 1} onClick={() => {
                if (set.id === activeSetId) setSelected(null);
                onRemoveSet(set.id);
              }} aria-label={`セット${index + 1}を削除`} className="grid size-10 place-items-center text-[var(--muted)] hover:text-[var(--coral)] disabled:opacity-25">
                <Icon name="trash" className="size-4" />
              </button>
              <textarea
                data-workout-set-note
                aria-label={`セット${index + 1}のメモ`}
                placeholder="セットメモ（任意）"
                rows={1}
                maxLength={500}
                value={set.note ?? ""}
                onFocus={() => setSelected(null)}
                onChange={(event) => onUpdateSet(set.id, { note: event.target.value || undefined })}
                className="form-input col-span-full mt-1 h-9 resize-none px-3 py-[7px] leading-5"
              />
            </div>)}
          </div>
          <div className="border-t border-[var(--line)] p-3">
            <Button type="button" variant="secondary" className="w-full text-[var(--sage-deep)]" onClick={() => {
              onAddSet();
              if (keypadMode) return;
              requestAnimationFrame(() => {
                const inputs = scrollerRef.current?.querySelectorAll<HTMLInputElement>('input[data-set-weight="true"]');
                inputs?.[inputs.length - 1]?.focus();
              });
            }}><Icon name="plus" className="size-4" />セットを1つ追加</Button>
          </div>
        </div>
      </section>
    </div>
    {active && <div className="workout-number-pad" role="group" aria-label="セット入力の数字キー">
      {digits.map((digit) => <button key={digit} type="button" onClick={() => applyKey(digit)}>{digit}</button>)}
      <button type="button" className="col-start-1 row-start-4" aria-label="小数点" disabled={active.key === "reps"} onClick={() => applyKey(".")}>.</button>
      <button type="button" className="col-span-2 col-start-2 row-start-4" onClick={() => applyKey("0")}>0</button>
      <button type="button" className="col-start-4 row-start-1" onClick={() => applyKey("Backspace")}>1桁削除</button>
      <button type="button" className="workout-number-pad-next col-start-4 row-span-3 row-start-2" onClick={() => applyKey("Enter")}>
        <Icon name="check" className="size-5" />{isFinalField ? "完了" : "次へ"}
      </button>
    </div>}
  </>;
}
