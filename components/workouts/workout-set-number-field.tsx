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
  autoFocusTarget?: boolean;
  lastField?: boolean;
  touchField?: { active: boolean; value: string; onSelect: () => void };
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
  const margin = 12;
  if (fieldRect.bottom > scrollRect.bottom - margin) scroller.scrollTop += fieldRect.bottom - scrollRect.bottom + margin;
  else if (fieldRect.top < scrollRect.top + margin) scroller.scrollTop -= scrollRect.top + margin - fieldRect.top;
}

export function WorkoutSetNumberField({ value, onCommit, previousValue, label, copyLabel, step, autoFocusTarget = false, lastField = false, touchField }: WorkoutSetNumberFieldProps) {
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);

  function commit(raw: string) {
    if (step === "1" && raw !== "" && !/^\d+$/.test(raw)) return;
    const next = raw === "" ? undefined : Number(raw);
    if (next !== undefined && (!Number.isFinite(next) || next < 0)) return;
    if (next !== value) onCommit(next);
  }

  const fieldClass = `metric h-12 px-1.5 text-left ${copyLabel ? "rounded-r-none" : ""}`;

  return <div className={copyLabel ? "grid min-w-0 grid-cols-[minmax(0,1fr)_36px] items-center" : "min-w-0"}>
    {touchField ? <button
      type="button"
      data-workout-set-field="true"
      aria-label={`${label}、${touchField.value || "未入力"}`}
      aria-pressed={touchField.active}
      className={`form-input ${fieldClass} touch-manipulation truncate aria-pressed:border-[var(--sage-deep)] aria-pressed:bg-[var(--sage-soft)]`}
      onClick={touchField.onSelect}
    >{touchField.value || <span className="text-[var(--muted)]">0</span>}</button> : <TextInput
      data-set-primary={autoFocusTarget || undefined}
      data-workout-set-field="true"
      type="number"
      min="0"
      step={step}
      inputMode="decimal"
      enterKeyHint={lastField ? "done" : "next"}
      aria-label={label}
      value={editing ? draft : value ?? ""}
      onFocus={() => { setDraft(value === undefined ? "" : String(value)); setEditing(true); }}
      onChange={(event) => { if (step !== "1" || /^\d*$/.test(event.target.value)) setDraft(event.target.value); }}
      onBlur={(event) => { setEditing(false); commit(event.currentTarget.value); }}
      onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); focusNextSetField(event.currentTarget); } }}
      placeholder="0"
      className={`${fieldClass} appearance-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none`}
    />}
    {copyLabel && <button
      type="button"
      aria-label={copyLabel}
      title={copyLabel}
      disabled={previousValue === undefined}
      onClick={() => { if (previousValue !== undefined) onCommit(previousValue); }}
      className="grid h-12 place-items-center rounded-r-md border border-l-0 border-[var(--field-line)] text-[var(--sage-deep)] enabled:hover:bg-[var(--sage-soft)] disabled:text-[var(--muted)] disabled:[&_svg]:opacity-40"
    ><Icon name="copy" className="size-4" /></button>}
  </div>;
}
