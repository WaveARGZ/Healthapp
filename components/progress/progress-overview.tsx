"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { bodyMakeClient } from "@/lib/api/client";
import { formatDate } from "@/lib/utils/date";
import type { WeightEntry } from "@/types/progress";

export function ProgressOverview() {
  const [weights, setWeights] = useState<WeightEntry[]>([]);
  useEffect(() => { void bodyMakeClient.getWeightEntries().then(setWeights); }, []);
  const latest = weights[0];
  const first = weights[weights.length - 1];
  const difference = latest && first && latest.id !== first.id ? latest.weightKg - first.weightKg : undefined;

  return <><PageHeader eyebrow="YOUR PROGRESS" title="変化を見る" description="数字と写真の両方から、今の自分を確かめられます。" />
    <div className="grid grid-cols-2 gap-3"><Link href="/weight"><Card className="h-full transition hover:-translate-y-0.5"><span className="grid size-10 place-items-center rounded-xl bg-[#eeeef9] text-[#6e68a6]"><Icon name="scale" className="size-5" /></span><p className="mt-4 text-xs font-bold text-[var(--muted)]">最新の体重</p><p className="mt-1 font-display text-2xl font-semibold tracking-[-0.04em] text-[var(--ink)]">{latest?.weightKg ?? "--"}<span className="ml-1 text-xs font-medium">kg</span></p></Card></Link><Link href="/photos"><Card className="h-full transition hover:-translate-y-0.5"><span className="grid size-10 place-items-center rounded-xl bg-[#f9eeee] text-[#b66d70]"><Icon name="camera" className="size-5" /></span><p className="mt-4 text-xs font-bold text-[var(--muted)]">身体写真</p><p className="mt-1 text-sm font-bold text-[var(--ink)]">比較する <Icon name="chevron-right" className="inline size-3.5" /></p></Card></Link></div>
    <section className="mt-7"><h2 className="font-display text-xl font-semibold tracking-[-0.035em] text-[var(--ink)]">体重の推移</h2><Card className="mt-3"><div className="flex h-36 items-end justify-between gap-2">{weights.slice(0, 7).reverse().map((entry, index, items) => { const values = items.map((item) => item.weightKg); const min = Math.min(...values); const max = Math.max(...values); const height = max === min ? 56 : 28 + ((entry.weightKg - min) / (max - min)) * 62; return <div key={entry.id} className="flex flex-1 flex-col items-center justify-end gap-2"><div className="w-full max-w-8 rounded-t-lg bg-[var(--sage-deep)]" style={{ height }} /><span className="text-[9px] text-[var(--muted)]">{new Date(`${entry.measuredOn}T00:00:00`).getDate()}</span></div>; })}{weights.length === 0 ? <div className="grid h-full w-full place-items-center text-center"><div><Icon name="progress" className="mx-auto size-6 text-[#b9c0bb]" /><p className="mt-2 text-xs text-[var(--muted)]">体重を記録すると推移が表示されます</p></div></div> : null}</div>{difference !== undefined ? <p className="mt-3 text-xs text-[var(--muted)]">{formatDate(first.measuredOn)}から <span className="font-bold text-[var(--sage-deep)]">{difference > 0 ? "+" : ""}{difference.toFixed(1)} kg</span></p> : null}</Card></section>
    <section className="mt-7"><h2 className="font-display text-xl font-semibold tracking-[-0.035em] text-[var(--ink)]">これから追加される機能</h2><div className="mt-3 space-y-3"><Card className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[var(--sage-soft)] text-[var(--sage-deep)]"><Icon name="sparkle" className="size-5" /></span><div><p className="text-sm font-bold text-[var(--ink)]">AIフィードバック</p><p className="mt-1 text-xs text-[var(--muted)]">記録から、次の一歩を提案します。</p></div></Card><Card className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[var(--sand)] text-[#9c8065]"><Icon name="camera" className="size-5" /></span><div><p className="text-sm font-bold text-[var(--ink)]">写真タイムラプス</p><p className="mt-1 text-xs text-[var(--muted)]">積み重ねた変化を動画で振り返ります。</p></div></Card></div></section>
  </>;
}
