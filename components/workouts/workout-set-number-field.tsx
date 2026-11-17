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
}

export function WorkoutSetNumberField({ value, onCommit, previousValue, label, copyLabel, step, inputMode, autoFocusTarget = false }: WorkoutSetNumberFieldProps) {
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);

  function commit(raw: string) {
    const next = raw === "" ? undefined : Number(raw);
    if (next !== value) onCommit(next);
  }

  return <div className="relative min-w-0">
    <TextInput
      data-set-weight={autoFocusTarget || undefined}
      type="number"
      min="0"
      step={step}
      inputMode={inputMode}
      aria-label={label}
      value={editing ? draft : value ?? ""}
      onFocus={() => { setDraft(value === undefined ? "" : String(value)); setEditing(true); }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => { setEditing(false); commit(event.currentTarget.value); }}
      onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }}
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
