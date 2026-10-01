"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { bodyMakeClient } from "@/lib/api/client";
import { formatDate, toDateInputValue } from "@/lib/utils/date";
import type { WeightEntry } from "@/types/progress";

export function ProgressOverview() {
  const [weights, setWeights] = useState<WeightEntry[]>([]);
  useEffect(() => { void bodyMakeClient.getWeightEntries().then(setWeights); }, []);
  const recorded = weights.filter((entry) => entry.measuredOn <= toDateInputValue()).sort((a, b) => b.measuredOn.localeCompare(a.measuredOn) || b.createdAt.localeCompare(a.createdAt));
  const latest = recorded[0];
  const first = recorded[recorded.length - 1];
  const difference = latest && first && latest.id !== first.id ? latest.weightKg - first.weightKg : undefined;
  const recent = recorded.slice(0, 7).reverse();
  const values = recent.map((entry) => entry.weightKg);
  const lower = values.length ? Math.floor(Math.min(...values) - 1) : 0;
  const upper = values.length ? Math.ceil(Math.max(...values) + 1) : 1;
  const points = recent.map((entry, index) => ({
    entry,
    x: recent.length === 1 ? 256 : 52 + index / (recent.length - 1) * 408,
    y: 24 + (upper - entry.weightKg) / (upper - lower) * 120,
  }));

  return <>
    <PageHeader title="進捗" description="体重と写真で、身体の変化を振り返る。" />
    <div className="grid grid-cols-2 border-y border-[var(--ink)] py-6">
      <div className="pr-5"><p className="text-xs text-[var(--muted)]">最新の体重</p><p className="metric mt-3 text-[42px] font-medium leading-none">{latest?.weightKg ?? "—"}<span className="ml-2 text-xs font-normal text-[var(--muted)]">kg</span></p><Link href="/weight" className="text-link mt-3">体重を記録<Icon name="plus" className="size-3.5" /></Link></div>
      <div className="border-l border-[var(--line)] pl-5"><p className="text-xs text-[var(--muted)]">初回からの変化</p><p className="metric mt-3 text-[42px] font-medium leading-none">{difference !== undefined ? `${difference > 0 ? "+" : ""}${difference.toFixed(1)}` : "—"}<span className="ml-2 text-xs font-normal text-[var(--muted)]">kg</span></p><p className="mt-5 text-[11px] text-[var(--muted)]">{first ? `${formatDate(first.measuredOn)}から` : "2回以上の記録で表示"}</p></div>
    </div>
    <section className="mt-10">
      <div className="mb-4 flex items-center justify-between"><h2 className="section-title">体重の推移</h2><span className="text-xs text-[var(--muted)]">直近7件</span></div>
      {recent.length ? <div className="border-y border-[var(--line)] py-5">
        <svg viewBox="0 0 490 192" className="w-full" role="img" aria-label={`直近の体重推移。${recent.map((entry) => `${entry.measuredOn}、${entry.weightKg}キログラム`).join("。")}`}>
          {[lower, (lower + upper) / 2, upper].map((tick) => { const y = 24 + (upper - tick) / (upper - lower) * 120; return <g key={tick}><line x1="52" x2="460" y1={y} y2={y} stroke="var(--line)" strokeDasharray="3 4" /><text x="38" y={y + 4} textAnchor="end" fontSize="10" fill="var(--muted)">{tick.toFixed(1)}</text></g>; })}
          {points.length > 1 && <polyline points={points.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke="var(--sage-deep)" strokeWidth="2" />}
          {points.map(({entry, x, y}) => <g key={entry.id}><circle cx={x} cy={y} r="4" fill="var(--sage-deep)" /><text x={x} y="176" textAnchor="middle" fontSize="10" fill="var(--muted)">{Number(entry.measuredOn.slice(5, 7))}/{Number(entry.measuredOn.slice(8))}</text></g>)}
        </svg>
        <p className="text-right text-[10px] text-[var(--muted)]">単位：kg</p>
      </div> : <EmptyState description="体重を記録すると、ここに推移が表示されます。" href="/weight" action="最初の体重を記録" />}
      {recent.length > 0 && <details className="mt-3 text-xs"><summary className="min-h-11 py-3 text-[var(--muted)]">数値を一覧で見る</summary><dl>{[...recent].reverse().map((entry) => <div key={entry.id} className="flex justify-between border-b border-[var(--line)] py-3"><dt>{formatDate(entry.measuredOn)}</dt><dd className="metric font-semibold">{entry.weightKg} kg</dd></div>)}</dl></details>}
    </section>
    <Link href="/photos" className="mt-10 flex items-center gap-5 border-y border-[var(--line)] py-6 hover:bg-[var(--sand)]">
      <Icon name="camera" className="size-6 shrink-0 text-[var(--sage-deep)]" /><div className="flex-1"><h2 className="section-title">写真で振り返る</h2><p className="mt-2 text-xs leading-6 text-[var(--muted)]">正面・背面の記録と、目標イメージの比較。</p></div><Icon name="arrow-right" className="size-5 shrink-0" />
    </Link>
    <p className="mt-6 text-[11px] leading-6 text-[var(--muted)]">写真タイムラプス・記録へのフィードバックは今後追加予定です。</p>
  </>;
}
