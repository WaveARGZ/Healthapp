"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldLabel, TextInput } from "@/components/ui/form-fields";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { bodyMakeClient } from "@/lib/api/client";
import { formatDate, toDateInputValue } from "@/lib/utils/date";
import { createId } from "@/lib/utils/id";
import type { WeightEntry } from "@/types/progress";

export function WeightRecorder() {
  const [measuredOn, setMeasuredOn] = useState(toDateInputValue());
  const [weightKg, setWeightKg] = useState("");
  const [entries, setEntries] = useState<WeightEntry[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => { void loadEntries(); }, []);
  async function loadEntries() { setEntries(await bodyMakeClient.getWeightEntries()); }
  const latest = useMemo(() => entries.find((entry) => entry.measuredOn <= toDateInputValue()), [entries]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!weightKg) return; setIsSaving(true);
    await bodyMakeClient.saveWeightEntry({ id: createId("weight"), measuredOn, weightKg: Number(weightKg), createdAt: new Date().toISOString() });
    setWeightKg(""); setIsSaving(false); await loadEntries();
  }
  async function deleteEntry(id: string) { await bodyMakeClient.deleteWeightEntry(id); await loadEntries(); }

  return <>
    <PageHeader eyebrow="WEIGHT LOG" title="体重を記録" description="日々の数値を、長い目でやさしく見ていきましょう。" />
    {latest ? <Card className="mb-4 flex items-center justify-between bg-[var(--ink)] text-white"><div><p className="text-xs font-bold tracking-[0.08em] text-white/55">LATEST WEIGHT</p><p className="mt-1 font-display text-3xl font-semibold tracking-[-0.05em]">{latest.weightKg}<span className="ml-1 text-sm font-medium text-white/55">kg</span></p></div><Icon name="scale" className="size-7 text-[var(--peach)]" /></Card> : null}
    <form onSubmit={handleSubmit} className="space-y-4"><Card><div className="grid grid-cols-2 gap-3"><div><FieldLabel htmlFor="weight-date">日付</FieldLabel><TextInput id="weight-date" type="date" value={measuredOn} onChange={(event) => setMeasuredOn(event.target.value)} required /></div><div><FieldLabel htmlFor="weight-value">体重 (kg)</FieldLabel><TextInput id="weight-value" type="number" min="20" max="400" step="0.1" inputMode="decimal" value={weightKg} onChange={(event) => setWeightKg(event.target.value)} placeholder="例：62.5" required /></div></div></Card><Button type="submit" className="w-full" disabled={isSaving}>{isSaving ? "保存中..." : "体重を保存"}</Button></form>
    <section className="mt-9"><h2 className="font-display text-xl font-semibold tracking-[-0.035em] text-[var(--ink)]">過去の体重</h2>{entries.length === 0 ? <Card className="mt-3 text-center"><Icon name="scale" className="mx-auto size-6 text-[#9692bd]" /><p className="mt-2 text-sm font-semibold text-[var(--ink)]">まだ記録がありません</p><p className="mt-1 text-xs text-[var(--muted)]">最初の数値を、今の自分の基準にしましょう。</p></Card> : <div className="mt-3 space-y-2">{entries.map((entry) => <Card key={entry.id} className="flex items-center justify-between p-4"><div><p className="text-xs font-semibold text-[var(--muted)]">{formatDate(entry.measuredOn)}</p><p className="mt-1 font-display text-xl font-semibold tracking-[-0.03em] text-[var(--ink)]">{entry.weightKg}<span className="ml-1 text-xs font-medium text-[var(--muted)]">kg</span></p></div><button type="button" aria-label="この体重記録を削除" onClick={() => void deleteEntry(entry.id)} className="rounded-lg p-1.5 text-[#9aa19e] hover:bg-[var(--coral-soft)] hover:text-[var(--coral)]"><Icon name="trash" className="size-4" /></button></Card>)}</div>}</section>
  </>;
}
