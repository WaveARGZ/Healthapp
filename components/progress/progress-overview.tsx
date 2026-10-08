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
    <div className="grid grid-cols-2 border-y border-[var(--ink)] py-6" aria-busy={loading}>
      <div className="min-w-0 pr-4"><p className="text-xs text-[var(--muted)]">最新の体重</p><p className="metric mt-3 flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-[32px] font-medium leading-none sm:text-[42px]"><span>{latest?.weightKg ?? "—"}</span><span className="text-xs font-normal text-[var(--muted)]">kg</span></p><Link href="/weight" className="text-link mt-3">体重を記録<Icon name="plus" className="size-3.5" /></Link></div>
      <div className="min-w-0 border-l border-[var(--line)] pl-4 sm:pl-5"><p className="text-xs text-[var(--muted)]">初回からの変化</p><p className="metric mt-3 flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-[32px] font-medium leading-none sm:text-[42px]"><span>{difference !== undefined ? `${difference > 0 ? "+" : ""}${difference.toFixed(1)}` : "—"}</span><span className="text-xs font-normal text-[var(--muted)]">kg</span></p><p className="mt-5 text-xs leading-5 text-[var(--muted)]">{first ? `${formatDate(first.measuredOn)}から` : "2回以上の記録で表示"}</p></div>
    </div>
    <WeightTrendChart entries={recorded} loading={loading} detail />
    <section aria-label="体重の記録一覧">
      {recent.length > 0 && <details className="mt-3 text-xs"><summary className="min-h-11 py-3 text-[var(--muted)]">数値を一覧で見る</summary><dl>{[...recent].reverse().map((entry) => <div key={entry.id} className="flex justify-between border-b border-[var(--line)] py-3"><dt>{formatDate(entry.measuredOn)}</dt><dd className="metric font-semibold">{entry.weightKg} kg</dd></div>)}</dl></details>}
    </section>
    <Link href="/photos" className="mt-10 flex items-center gap-5 border-y border-[var(--line)] py-6 hover:bg-[var(--sand)]">
      <Icon name="camera" className="size-6 shrink-0 text-[var(--sage-deep)]" /><div className="flex-1"><h2 className="section-title">写真で振り返る</h2><p className="mt-2 text-xs leading-6 text-[var(--muted)]">正面・背面の記録と、目標イメージの比較。</p></div><Icon name="arrow-right" className="size-5 shrink-0" />
    </Link>
    <p className="mt-6 text-xs leading-6 text-[var(--muted)]">写真タイムラプス・記録へのフィードバックは今後追加予定です。</p>
  </>;
}
