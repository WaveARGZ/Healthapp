"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldLabel, TextInput } from "@/components/ui/form-fields";
import { bodyMakeClient } from "@/lib/api/client";
import { dailyBurnId } from "@/lib/utils/daily-burn";
import { toDateInputValue } from "@/lib/utils/date";
import type { DailyBurnEntry } from "@/types/workout";

export function DailyBurnRecorder() {
  const [day, setDay] = useState(toDateInputValue);
  const [draft, setDraft] = useState<{ day: string; value: string } | null>(null);
  const [entries, setEntries] = useState<DailyBurnEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const savedEntry = entries.find((entry) => entry.performedAt === day);
  const calories = draft?.day === day ? draft.value : savedEntry?.caloriesBurned.toString() ?? "";

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
      setNotice("日付と0〜20,000 kcalの整数を入力してください。");
      return;
    }
    const entry: DailyBurnEntry = {
      id: dailyBurnId(day), performedAt: day, recordType: "daily-burn",
      caloriesBurned: amount, exercises: [], createdAt: savedEntry?.createdAt ?? new Date().toISOString(),
    };
    setSaving(true);
    setNotice("");
    try {
      await bodyMakeClient.saveDailyBurnEntry(entry);
      setEntries((current) => [entry, ...current.filter((item) => item.id !== entry.id)]);
      setNotice("消費カロリーを保存しました。");
    } catch {
      setNotice("消費カロリーを保存できませんでした。もう一度お試しください。");
    } finally { setSaving(false); }
  }

  async function remove() {
    if (!savedEntry) return;
    setSaving(true);
    setNotice("");
    try {
      await bodyMakeClient.deleteDailyBurnEntry(savedEntry.id);
      setEntries((current) => current.filter((entry) => entry.id !== savedEntry.id));
      setDraft(null);
      setNotice("この日の消費カロリーを削除しました。");
    } catch {
      setNotice("削除できませんでした。もう一度お試しください。");
    } finally { setSaving(false); }
  }

  return <section aria-labelledby="daily-burn-title" className="mb-6 rounded-xl border border-[var(--line)] bg-[var(--sand)] p-4 sm:p-5">
    <h2 id="daily-burn-title" className="text-base font-bold">消費カロリーを記録</h2>
    <p className="mt-1 text-xs leading-5 text-[var(--muted)]">活動量計などで確認した、その日の総消費カロリーを入力します。種目の記録とは別に保存されます。</p>
    <form onSubmit={save} className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,180px)_minmax(0,180px)_auto] sm:items-end">
      <div className="min-w-0"><FieldLabel htmlFor="burn-date">日付</FieldLabel><TextInput id="burn-date" type="date" value={day} onChange={(event) => { setDay(event.target.value); setDraft(null); setNotice(""); }} required disabled={loading || loadFailed || saving} /></div>
      <div className="min-w-0"><FieldLabel htmlFor="burn-calories">消費カロリー（kcal）</FieldLabel><TextInput id="burn-calories" type="number" min="0" max="20000" step="1" inputMode="numeric" value={calories} onChange={(event) => { setDraft({ day, value: event.target.value }); setNotice(""); }} placeholder="例：2200" required disabled={loading || loadFailed || saving} /></div>
      <Button type="submit" disabled={loading || loadFailed || saving}>{saving ? "保存中…" : savedEntry ? "更新する" : "保存する"}</Button>
    </form>
    {savedEntry && !loading && !loadFailed && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs"><p>保存済み：<strong className="metric">{savedEntry.caloriesBurned.toLocaleString("ja-JP")} kcal</strong></p><button type="button" onClick={() => void remove()} disabled={saving} className="min-h-11 text-[var(--coral)] underline underline-offset-2 disabled:opacity-45">この日の記録を削除</button></div>}
    {loadFailed && <p role="alert" className="mt-3 text-xs text-[var(--coral)]">消費カロリーを読み込めませんでした。ページを再読み込みしてください。</p>}
    {notice && <p role="status" className="mt-3 text-xs text-[var(--ink-soft)]">{notice}</p>}
  </section>;
}
