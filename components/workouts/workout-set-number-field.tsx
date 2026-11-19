"use client";

import { useState } from "react";
import { TextInput } from "@/components/ui/form-fields";
import { Icon } from "@/components/ui/icon";

interface WorkoutSetNumberFieldProps {
  value: number | undefined;
  onCommit: (value: number | undefined) => void;
  previousValue?: number;
  label: string;
  copyLabel?: string;
  step: string;
  inputMode: "decimal" | "numeric";
  autoFocusTarget?: boolean;
  lastField?: boolean;
}

function focusNextSetField(input: HTMLInputElement) {
  const fields = Array.from(input.closest("[data-workout-set-editor]")?.querySelectorAll<HTMLInputElement>("[data-workout-set-field]") ?? []);
  const index = fields.indexOf(input);
  if (index < 0) return;
  const next = fields[index + 1];
  if (!next) { input.blur(); return; }

  next.focus({ preventScroll: true });
  const scroller = next.closest<HTMLElement>(".exercise-dialog-scroll");
  if (!scroller) return;
  const fieldRect = next.getBoundingClientRect();
  const scrollRect = scroller.getBoundingClientRect();
  const visualTop = window.visualViewport?.offsetTop ?? 0;
  const visibleTop = Math.max(scrollRect.top, visualTop);
  const visibleBottom = Math.min(scrollRect.bottom, visualTop + (window.visualViewport?.height ?? window.innerHeight));
  const margin = 12;
  if (fieldRect.bottom > visibleBottom - margin) scroller.scrollTop += fieldRect.bottom - visibleBottom + margin;
  else if (fieldRect.top < visibleTop + margin) scroller.scrollTop -= visibleTop + margin - fieldRect.top;
}

export function WorkoutSetNumberField({ value, onCommit, previousValue, label, copyLabel, step, inputMode, autoFocusTarget = false, lastField = false }: WorkoutSetNumberFieldProps) {
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);

  function commit(raw: string) {
    if (step === "1" && raw !== "" && !/^\d+$/.test(raw)) return;
    const next = raw === "" ? undefined : Number(raw);
    if (next !== value) onCommit(next);
  }

  return <div className="relative min-w-0">
    <TextInput
      data-set-weight={autoFocusTarget || undefined}
      data-workout-set-field="true"
      type="number"
      min="0"
      step={step}
      inputMode={inputMode}
      enterKeyHint={lastField ? "done" : "next"}
      aria-label={label}
      value={editing ? draft : value ?? ""}
      onFocus={() => { setDraft(value === undefined ? "" : String(value)); setEditing(true); }}
      onChange={(event) => { if (step !== "1" || /^\d*$/.test(event.target.value)) setDraft(event.target.value); }}
      onBlur={(event) => { setEditing(false); commit(event.currentTarget.value); }}
      onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); focusNextSetField(event.currentTarget); } }}
      placeholder="0"
      className={`metric h-12 appearance-none px-2 text-left [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none ${copyLabel ? "pr-10" : ""}`}
    />
    {copyLabel && <button
      type="button"
      aria-label={copyLabel}
      title={copyLabel}
      disabled={previousValue === undefined}
      onClick={() => { if (previousValue !== undefined) onCommit(previousValue); }}
      className="absolute right-1 top-1 grid size-10 place-items-center rounded-md text-[var(--sage-deep)] hover:bg-[var(--sage-soft)] disabled:text-[var(--muted)] disabled:opacity-40"
    ><Icon name="copy" className="size-4" /></button>}
  </div>;
}
