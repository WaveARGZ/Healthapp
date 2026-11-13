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
    <div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[0_6px_18px_rgba(32,38,34,.04)]" aria-busy={loading}>
      <div className="min-w-0 p-4 sm:p-6"><p className="text-xs font-semibold text-[var(--muted)]">最新の体重</p><p className="metric mt-3 flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-[32px] font-bold leading-none text-[var(--ink)] sm:text-[42px]"><span>{latest?.weightKg ?? "—"}</span><span className="text-xs font-normal text-[var(--muted)]">kg</span></p><Link href="/weight" className="text-link mt-3">体重を記録<Icon name="plus" className="size-3.5" /></Link></div>
      <div className="min-w-0 border-l border-[var(--line)] p-4 sm:p-6"><p className="text-xs font-semibold text-[var(--muted)]">初回からの変化</p><p className="metric mt-3 flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-[32px] font-bold leading-none text-[var(--ink)] sm:text-[42px]"><span>{difference !== undefined ? `${difference > 0 ? "+" : ""}${difference.toFixed(1)}` : "—"}</span><span className="text-xs font-normal text-[var(--muted)]">kg</span></p><p className="mt-5 text-xs leading-5 text-[var(--muted)]">{first ? `${formatDate(first.measuredOn)}から` : "2回以上の記録で表示"}</p></div>
    </div>
    <WeightTrendChart entries={recorded} loading={loading} detail />
    <section aria-label="体重の記録一覧">
      {recent.length > 0 && <details className="mt-3 rounded-2xl border border-[var(--line)] bg-white px-4 text-xs sm:px-5"><summary className="min-h-12 py-3 font-semibold text-[var(--ink)]">数値を一覧で見る</summary><dl className="border-t border-[var(--line)] pb-2">{[...recent].reverse().map((entry) => <div key={entry.id} className="flex justify-between border-b border-[var(--line)] py-3 last:border-b-0"><dt>{formatDate(entry.measuredOn)}</dt><dd className="metric font-semibold">{entry.weightKg} kg</dd></div>)}</dl></details>}
    </section>
    <Link href="/photos" className="mt-8 flex min-h-24 items-center gap-4 rounded-2xl border border-[var(--line)] bg-white p-4 shadow-[0_6px_18px_rgba(32,38,34,.04)] hover:bg-[var(--sand)] sm:p-5">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--sage-soft)]"><Icon name="camera" className="size-5 text-[var(--sage-deep)]" /></span><div className="flex-1"><h2 className="section-title">写真で振り返る</h2><p className="mt-1 text-xs leading-6 text-[var(--muted)]">正面・背面の記録と、目標イメージの比較。</p></div><Icon name="arrow-right" className="size-5 shrink-0 text-[var(--sage-deep)]" />
    </Link>
    <p className="mt-6 text-xs leading-6 text-[var(--muted)]">写真タイムラプス・記録へのフィードバックは今後追加予定です。</p>
  </>;
}
