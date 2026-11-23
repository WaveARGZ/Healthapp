"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldLabel, TextInput } from "@/components/ui/form-fields";
import { bodyMakeClient } from "@/lib/api/client";
import { dailyBurnId } from "@/lib/utils/daily-burn";
import { formatDate } from "@/lib/utils/date";
import type { DailyBurnEntry } from "@/types/workout";

export function DailyBurnRecorder({ day }: { day: string }) {
  const [draft, setDraft] = useState<{ day: string; value: string } | null>(null);
  const [entries, setEntries] = useState<DailyBurnEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ day: string; text: string } | null>(null);
  const savedEntry = entries.find((entry) => entry.performedAt === day);
  const savedActivity = savedEntry?.burnScope === "activity";
  const calories = draft?.day === day ? draft.value : savedActivity ? savedEntry.caloriesBurned.toString() : "";

  useEffect(() => {
    let active = true;
    void bodyMakeClient.getDailyBurnEntries()
      .then((value) => { if (active) setEntries(value); })
      .catch(() => { if (active) setLoadFailed(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(calories);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isInteger(amount) || amount < 0 || amount > 20_000 || calories.trim() === "") {
      setNotice({ day, text: "0〜20,000 kcalの整数を入力してください。" });
      return;
    }
    const entry: DailyBurnEntry = {
      id: dailyBurnId(day), performedAt: day, recordType: "daily-burn",
      caloriesBurned: amount, burnScope: "activity", exercises: [], createdAt: savedEntry?.createdAt ?? new Date().toISOString(),
    };
    setSaving(true);
    setNotice(null);
    try {
      await bodyMakeClient.saveDailyBurnEntry(entry);
      setEntries((current) => [entry, ...current.filter((item) => item.id !== entry.id)]);
      setNotice({ day, text: "消費カロリーを保存しました。" });
    } catch {
      setNotice({ day, text: "消費カロリーを保存できませんでした。もう一度お試しください。" });
    } finally { setSaving(false); }
  }

  async function remove() {
    if (!savedEntry) return;
    setSaving(true);
    setNotice(null);
    try {
      await bodyMakeClient.deleteDailyBurnEntry(savedEntry.id);
      setEntries((current) => current.filter((entry) => entry.id !== savedEntry.id));
      setDraft(null);
      setNotice({ day, text: "この日の消費カロリーを削除しました。" });
    } catch {
      setNotice({ day, text: "削除できませんでした。もう一度お試しください。" });
    } finally { setSaving(false); }
  }

  return <section aria-labelledby="daily-burn-title" className="mb-6 rounded-lg border border-[var(--line)] bg-white p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h2 id="daily-burn-title" className="text-base font-bold">消費カロリー</h2><p className="mt-1 text-xs leading-5 text-[var(--muted)]">{formatDate(day, { year: "numeric" })}の活動消費を記録</p></div>
      {savedEntry && <span className="metric rounded-full bg-[var(--sage-soft)] px-3 py-1.5 text-xs font-bold text-[var(--sage-deep)]">{savedActivity ? "活動消費" : "以前の総消費"} {savedEntry.caloriesBurned.toLocaleString("ja-JP")} kcal</span>}
    </div>
    <p id="daily-burn-help" className="mt-2 text-sm leading-6 text-[var(--muted)]">基礎代謝を除いた消費カロリーを入力してください。基礎代謝はプロフィールから自動で計算し、収支に加えます。</p>
    <form onSubmit={save} className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,220px)_auto] sm:items-end sm:justify-start">
      <div className="min-w-0">
        <FieldLabel htmlFor="burn-calories">活動消費（kcal）</FieldLabel>
        <TextInput id="burn-calories" aria-describedby="daily-burn-help" type="number" min="0" max="20000" step="1" inputMode="numeric" value={calories}
          onChange={(event) => { setDraft({ day, value: event.target.value }); setNotice(null); }} placeholder="例：400" required disabled={loading || loadFailed || saving} />
      </div>
      <Button type="submit" disabled={loading || loadFailed || saving}>{saving ? "保存中…" : savedEntry ? "更新する" : "保存する"}</Button>
    </form>
    {savedEntry && !loading && !loadFailed && <div className="mt-1 flex justify-end"><button type="button" onClick={() => void remove()} disabled={saving} className="min-h-11 text-xs text-[var(--coral)] underline underline-offset-2 disabled:opacity-45">この日の記録を削除</button></div>}
    {loadFailed && <p role="alert" className="mt-3 text-xs text-[var(--coral)]">消費カロリーを読み込めませんでした。ページを再読み込みしてください。</p>}
    {notice?.day === day && <p role="status" className="mt-3 text-xs text-[var(--ink-soft)]">{notice.text}</p>}
  </section>;
}
