"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { RecordActions } from "@/components/ui/record-actions";
import { EmptyState } from "@/components/ui/empty-state";
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
  const [notice, setNotice] = useState("");

  useEffect(() => { void loadEntries(); }, []);
  async function loadEntries() { setEntries((await bodyMakeClient.getWeightEntries()).sort((a, b) => b.measuredOn.localeCompare(a.measuredOn) || b.createdAt.localeCompare(a.createdAt))); }
  const latest = useMemo(() => entries.find((entry) => entry.measuredOn <= toDateInputValue()), [entries]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!weightKg) return; setIsSaving(true);
    setNotice("");
    try {
      await bodyMakeClient.saveWeightEntry({ id: createId("weight"), measuredOn, weightKg: Number(weightKg), createdAt: new Date().toISOString() });
      setWeightKg(""); await loadEntries(); setNotice("体重を保存しました。");
    } catch { setNotice("保存できませんでした。もう一度お試しください。"); }
    finally { setIsSaving(false); }
  }
  async function deleteEntry(id: string) { await bodyMakeClient.deleteWeightEntry(id); await loadEntries(); }

  return <>
    <PageHeader title="体重" description="日付と体重を入力して保存。" />
    {latest && <div className="mb-8 flex flex-wrap items-end justify-between gap-x-5 gap-y-2 border-y border-[var(--ink)] py-6"><div><p className="text-xs text-[var(--muted)]">最新の記録</p><p className="metric mt-2 text-[42px] font-medium sm:text-5xl">{latest.weightKg}<span className="ml-2 text-sm text-[var(--muted)]">kg</span></p></div><p className="pb-1 text-xs text-[var(--muted)]">{formatDate(latest.measuredOn)}</p></div>}
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2"><div><FieldLabel htmlFor="weight-date">日付</FieldLabel><TextInput id="weight-date" type="date" value={measuredOn} onChange={(event) => setMeasuredOn(event.target.value)} required /></div><div><FieldLabel htmlFor="weight-value">体重 (kg)</FieldLabel><TextInput id="weight-value" type="number" min="20" max="400" step="0.1" inputMode="decimal" value={weightKg} onChange={(event) => setWeightKg(event.target.value)} placeholder="例：62.5" required className="metric" /></div></div>
      <RecordActions label={isSaving ? "保存中…" : "体重を保存"} summary={weightKg ? `${weightKg} kg` : "体重の記録"} disabled={isSaving || !weightKg} notice={notice} />
    </form>
    <section className="mt-12"><div className="mb-4 flex items-center justify-between"><h2 className="section-title">これまでの記録</h2><span className="text-xs text-[var(--muted)]">{entries.length}件</span></div>
      {entries.length === 0 ? <EmptyState description="保存した体重はここに表示されます。" /> : <div className="border-t border-[var(--line)]">{entries.map((entry) => <div key={entry.id} className="flex items-center gap-3 border-b border-[var(--line)] py-3"><p className="flex-1 text-xs text-[var(--muted)]">{formatDate(entry.measuredOn)}</p><p className="metric text-xl font-medium">{entry.weightKg}<span className="ml-1 text-xs text-[var(--muted)]">kg</span></p><button type="button" aria-label="この体重記録を削除" onClick={() => void deleteEntry(entry.id)} className="delete-button"><Icon name="trash" className="size-4" /></button></div>)}</div>}
    </section>
  </>;
}
