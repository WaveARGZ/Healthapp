"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { WeightTrendChart } from "@/components/progress/weight-trend-chart";
import { bodyMakeClient } from "@/lib/api/client";
import { formatDate, toDateInputValue } from "@/lib/utils/date";
import type { WeightEntry } from "@/types/progress";

export function ProgressOverview() {
  const [weights, setWeights] = useState<WeightEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    void bodyMakeClient.getWeightEntries().then(setWeights)
      .catch(() => setError("体重の記録を読み込めませんでした。ページを再読み込みしてください。"))
      .finally(() => setLoading(false));
  }, []);
  const recorded = weights.filter((entry) => entry.measuredOn <= toDateInputValue()).sort((a, b) => b.measuredOn.localeCompare(a.measuredOn) || b.createdAt.localeCompare(a.createdAt));
  const latest = recorded[0];
  const first = recorded[recorded.length - 1];
  const difference = latest && first && latest.id !== first.id ? latest.weightKg - first.weightKg : undefined;
  const recent = recorded.slice(0, 7).reverse();

  return <>
    <PageHeader title="進捗" description="体重と写真で、身体の変化を振り返る。" />
    {error && <p role="alert" className="mb-4 text-sm leading-6 text-[var(--coral)]">{error}</p>}
    <div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-[var(--line)] bg-white" aria-busy={loading}>
      <div className="min-w-0 bg-[var(--sage-soft)] p-4 sm:p-7">
        <p className="text-sm font-semibold text-[var(--ink-soft)]">最新の体重</p>
        <p className="metric mt-3 flex flex-wrap items-baseline gap-x-1.5 text-4xl font-semibold leading-none text-[var(--ink)] sm:text-5xl">{latest?.weightKg ?? "—"}<span className="text-sm font-medium">kg</span></p>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{latest ? formatDate(latest.measuredOn) : loading ? "読み込み中…" : error ? "取得できませんでした" : "まだ記録がありません"}</p>
      </div>
      <div className="min-w-0 p-4 sm:p-7">
        <p className="text-sm font-semibold text-[var(--ink-soft)]">初回からの変化</p>
        <p className="metric mt-3 flex flex-wrap items-baseline gap-x-1.5 text-4xl font-semibold leading-none text-[var(--ink)] sm:text-5xl">{difference !== undefined ? `${difference > 0 ? "+" : ""}${difference.toFixed(1)}` : "—"}<span className="text-sm font-medium">kg</span></p>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{difference !== undefined && first ? `${formatDate(first.measuredOn)}から` : "2回以上の記録で表示"}</p>
      </div>
    </div>
    <div className="mt-4 flex flex-wrap gap-3">
      <Link href="/weight" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--sage-deep)] px-5 text-sm font-bold text-white hover:bg-[var(--ink)]"><Icon name="plus" className="size-4" />体重を記録</Link>
      <Link href="/photos" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[var(--line)] bg-white px-5 text-sm font-semibold text-[var(--ink)] hover:border-[var(--sage-deep)]"><Icon name="camera" className="size-4" />身体写真を記録・比較</Link>
    </div>
    <WeightTrendChart entries={recorded} loading={loading} detail />
    <section aria-label="体重の記録一覧">
      {recent.length > 0 && <details className="mt-3 rounded-2xl border border-[var(--line)] bg-white px-4 text-sm sm:px-5"><summary className="min-h-12 py-3 font-semibold text-[var(--ink)]">数値を一覧で見る</summary><dl className="border-t border-[var(--line)] pb-2">{[...recent].reverse().map((entry) => <div key={entry.id} className="flex justify-between border-b border-[var(--line)] py-3 last:border-b-0"><dt>{formatDate(entry.measuredOn)}</dt><dd className="metric font-semibold">{entry.weightKg} kg</dd></div>)}</dl></details>}
    </section>
  </>;
}
