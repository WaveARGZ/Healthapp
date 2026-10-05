import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils/date";
import type { WeightEntry } from "@/types/progress";

export function WeightTrendChart({ entries, loading = false }: { entries: WeightEntry[]; loading?: boolean }) {
  const recent = [...entries]
    .filter((entry) => entry.weightKg > 0)
    .sort((first, second) => first.measuredOn.localeCompare(second.measuredOn) || first.createdAt.localeCompare(second.createdAt))
    .slice(-7);
  const values = recent.map((entry) => entry.weightKg);
  const lower = values.length ? Math.floor(Math.min(...values) - 1) : 0;
  const upper = values.length ? Math.ceil(Math.max(...values) + 1) : 1;
  const points = recent.map((entry, index) => ({
    entry,
    x: recent.length === 1 ? 256 : 52 + (index / (recent.length - 1)) * 408,
    y: 24 + ((upper - entry.weightKg) / (upper - lower)) * 112,
  }));

  return (
    <section className="mt-6 rounded-md border border-[var(--line)] bg-[var(--sand)] px-4 py-4 sm:px-5 sm:py-5" aria-labelledby="dashboard-weight-title" aria-busy={loading}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <h2 id="dashboard-weight-title" className="section-title">体重の変化</h2>
          <p className="mt-1 text-[11px] text-[var(--muted)]">記録した直近7件</p>
        </div>
        <Link href="/progress" className="text-link shrink-0">詳しく見る <span aria-hidden="true">↗</span></Link>
      </div>
      {loading ? (
        <p className="border-y border-[var(--line)] py-8 text-center text-xs text-[var(--muted)]">体重記録を読み込み中…</p>
      ) : recent.length === 0 ? (
        <div className="border-y border-[var(--line)]"><EmptyState description="体重を記録すると、変化がグラフに表示されます。" href="/weight" action="体重を記録" /></div>
      ) : (
        <div className="border-y border-[var(--line)] py-3">
          <svg
            viewBox="0 0 490 178"
            className="w-full overflow-visible"
            role="img"
            aria-label={`直近の体重推移。${recent.map((entry) => `${formatDate(entry.measuredOn)}、${entry.weightKg}キログラム`).join("。")}`}
          >
            {[lower, (lower + upper) / 2, upper].map((tick) => {
              const y = 24 + ((upper - tick) / (upper - lower)) * 112;
              return <g key={tick}>
                <line x1="52" x2="460" y1={y} y2={y} stroke="var(--line)" strokeDasharray="3 4" />
                <text x="42" y={y + 4} textAnchor="end" fontSize="10" fill="var(--muted)">{tick.toFixed(1)}</text>
              </g>;
            })}
            {points.length > 1 && <polyline points={points.map(({ x, y }) => `${x},${y}`).join(" ")} fill="none" stroke="var(--sage-deep)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
            {points.map(({ entry, x, y }) => <g key={entry.id}>
              <circle cx={x} cy={y} r="4" fill="var(--sage-deep)" />
              <text x={x} y="164" textAnchor="middle" fontSize="10" fill="var(--muted)">{Number(entry.measuredOn.slice(5, 7))}/{Number(entry.measuredOn.slice(8))}</text>
            </g>)}
          </svg>
          <p className="mt-1 text-right text-[10px] text-[var(--muted)]">単位：kg</p>
        </div>
      )}
    </section>
  );
}
