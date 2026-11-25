"use client";

import { FormEvent, useState } from "react";
import { RecordActions } from "@/components/ui/record-actions";
import { EmptyState } from "@/components/ui/empty-state";
import { FieldLabel, TextInput } from "@/components/ui/form-fields";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { useWeightHistory } from "@/hooks/use-weight-history";
import { bodyMakeClient } from "@/lib/api/client";
import { isBodyWeightKg, latestWeightEntry } from "@/lib/utils/current-weight";
import { formatDate, toDateInputValue } from "@/lib/utils/date";
import { createId } from "@/lib/utils/id";

export function WeightRecorder() {
  const [measuredOn, setMeasuredOn] = useState(toDateInputValue());
  const [weightKg, setWeightKg] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const { entries, startingWeightKg, today, loading, weightsUnavailable, profileUnavailable, refresh } = useWeightHistory();
  const latest = latestWeightEntry(entries, today);
  const currentWeightKg = latest?.weightKg ?? (weightsUnavailable ? undefined : startingWeightKg);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(weightKg);
    if (isSaving || !measuredOn || !isBodyWeightKg(value)) return;
    setIsSaving(true);
    setNotice("");
    try {
      await bodyMakeClient.saveWeightEntry({ id: createId("weight"), measuredOn, weightKg: value, createdAt: new Date().toISOString() });
      setWeightKg("");
      await refresh();
      setNotice("体重を保存しました。");
    } catch { setNotice("保存できませんでした。もう一度お試しください。"); }
    finally { setIsSaving(false); }
  }
  async function deleteEntry(id: string) {
    if (isSaving) return;
    setIsSaving(true);
    setNotice("");
    try {
      await bodyMakeClient.deleteWeightEntry(id);
      await refresh();
    } catch { setNotice("削除できませんでした。もう一度お試しください。"); }
    finally { setIsSaving(false); }
  }

  return <>
    <PageHeader title="体重" />
    {(weightsUnavailable || profileUnavailable) && <p role="alert" className="mb-4 text-sm text-[var(--coral)]">体重に関する情報の一部を読み込めませんでした。</p>}
    <div className={currentWeightKg !== undefined ? "grid items-start gap-4 md:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]" : ""}>
      <form onSubmit={handleSubmit} className="panel space-y-5">
        <h2 className="section-title">新しい記録</h2>
        <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,11rem),1fr))] gap-5">
          <div className="min-w-0">
            <FieldLabel htmlFor="weight-date">日付</FieldLabel>
            <TextInput id="weight-date" type="date" value={measuredOn} onChange={(event) => setMeasuredOn(event.target.value)} required className="weight-date-input" />
          </div>
          <div className="min-w-0">
            <FieldLabel htmlFor="weight-value">体重 (kg)</FieldLabel>
            <TextInput id="weight-value" type="number" min="20" max="400" step="0.1" inputMode="decimal" value={weightKg} onChange={(event) => setWeightKg(event.target.value)} placeholder="例：62.5" required className="metric" />
          </div>
        </div>
        <RecordActions label={isSaving ? "保存中…" : "体重を保存"} summary={weightKg ? `${weightKg} kg` : "体重の記録"} disabled={isSaving || !weightKg} notice={notice} />
      </form>
      {currentWeightKg !== undefined && <section className="min-w-0 rounded-lg border border-[var(--line)] bg-white p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-[var(--ink-soft)]">現在の体重</h2>
        <p className="metric mt-3 text-4xl font-semibold text-[var(--ink)]">{currentWeightKg}<span className="ml-2 text-sm font-medium">kg</span></p>
        <p className="mt-2 text-sm text-[var(--muted)]">{latest ? formatDate(latest.measuredOn) : "初期設定の体重"}</p>
      </section>}
    </div>
    <section className="mt-8"><div className="mb-4 flex items-center justify-between"><h2 className="section-title">これまでの記録</h2><span className="text-xs text-[var(--muted)]">{entries.length}件</span></div>
      {loading ? <p role="status" className="text-sm text-[var(--muted)]">体重記録を読み込み中…</p> : entries.length === 0 ? <EmptyState description={weightsUnavailable ? "体重の記録を読み込めませんでした。" : "まだ記録はありません。"} /> : <div className="overflow-hidden rounded-lg border border-[var(--line)] bg-white px-4 sm:px-5">{entries.map((entry) => <div key={entry.id} className="flex min-h-16 items-center gap-3 border-b border-[var(--line)] py-3 last:border-b-0"><p className="flex-1 text-sm text-[var(--muted)]">{formatDate(entry.measuredOn)}</p><p className="metric text-xl font-semibold">{entry.weightKg}<span className="ml-1 text-xs font-normal text-[var(--muted)]">kg</span></p><button type="button" aria-label="この体重記録を削除" disabled={isSaving} onClick={() => void deleteEntry(entry.id)} className="delete-button"><Icon name="trash" className="size-4" /></button></div>)}</div>}
    </section>
  </>;
}
