import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils/date";
import type { WeightEntry } from "@/types/progress";

export function WeightTrendChart({ entries, loading = false, detail = false }: { entries: WeightEntry[]; loading?: boolean; detail?: boolean }) {
  const latestByDay = [...entries]
    .filter((entry) => entry.weightKg > 0)
    .sort((first, second) => first.measuredOn.localeCompare(second.measuredOn) || first.createdAt.localeCompare(second.createdAt))
    .reduce((byDay, entry) => byDay.set(entry.measuredOn, entry), new Map<string, WeightEntry>());
  const recent = [...latestByDay.values()].slice(-7);
  const values = recent.map((entry) => entry.weightKg);
  const lower = values.length ? Math.floor(Math.min(...values) - 1) : 0;
  const upper = values.length ? Math.ceil(Math.max(...values) + 1) : 1;
  const points = recent.map((entry, index) => ({
    entry,
    x: ((index + 0.5) / recent.length) * 600,
    y: 12 + ((upper - entry.weightKg) / (upper - lower)) * 136,
  }));

  return (
    <section className="mt-6 min-w-0 rounded-md border border-[var(--line)] bg-[var(--sand)] p-4 sm:p-5" aria-labelledby="weight-trend-title" aria-busy={loading}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <h2 id="weight-trend-title" className="section-title">体重の変化</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">記録した直近7日分</p>
        </div>
        <Link href={detail ? "/weight" : "/progress"} className="text-link shrink-0">{detail ? "体重を記録" : "詳しく見る"} <span aria-hidden="true">↗</span></Link>
      </div>
      {loading ? (
        <p className="border-y border-[var(--line)] py-8 text-center text-xs text-[var(--muted)]">体重記録を読み込み中…</p>
      ) : recent.length === 0 ? (
        <div className="border-y border-[var(--line)]"><EmptyState description="体重を記録すると、変化がグラフに表示されます。" href="/weight" action="体重を記録" /></div>
      ) : (
        <div className="mt-4 border-t border-[var(--line)] pt-4">
          <div className="grid grid-cols-[36px_minmax(0,1fr)] gap-x-1">
            <div aria-hidden="true" className="relative h-40 text-[11px] tabular-nums text-[var(--muted)] sm:text-xs">
              {[upper, (lower + upper) / 2, lower].map((tick, index) => <span key={tick} className="absolute right-1 -translate-y-1/2" style={{ top: `${12 + index * 68}px` }}>{tick.toFixed(1)}</span>)}
            </div>
          <svg
            viewBox="0 0 600 160"
            preserveAspectRatio="none"
            className="h-40 w-full"
            role="img"
            aria-label={`直近の体重推移。${recent.map((entry) => `${formatDate(entry.measuredOn)}、${entry.weightKg}キログラム`).join("。")}`}
          >
            {[12, 80, 148].map((y) => <line key={y} x1="0" x2="600" y1={y} y2={y} stroke="var(--line)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />)}
            {points.length > 1 && <polyline points={points.map(({ x, y }) => `${x},${y}`).join(" ")} fill="none" stroke="var(--sage-deep)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
            {points.map(({ entry, x, y }) => <line key={entry.id} x1={x} x2={x} y1={y} y2={y + 0.01} stroke="var(--sage-deep)" strokeWidth="7" strokeLinecap="round" vectorEffect="non-scaling-stroke" />)}
          </svg>
            <div aria-hidden="true" className="col-start-2 mt-2 grid text-center text-[11px] tabular-nums text-[var(--muted)] sm:text-xs" style={{ gridTemplateColumns: `repeat(${recent.length}, minmax(0, 1fr))` }}>{recent.map((entry) => <span key={entry.id}>{Number(entry.measuredOn.slice(5, 7))}/{Number(entry.measuredOn.slice(8))}</span>)}</div>
          </div>
          <p className="mt-3 text-right text-xs text-[var(--muted)]">単位：kg</p>
        </div>
      )}
    </section>
  );
}
