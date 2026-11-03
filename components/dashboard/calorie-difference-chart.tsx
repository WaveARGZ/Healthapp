import Link from "next/link";
import { burnMinusIntake } from "@/lib/utils/daily-burn";

function CalorieBar({ label, value, scale, color }: { label: string; value: number | null; scale: number; color: string }) {
  return <div>
    <div className="metric mb-1 flex justify-between gap-3 text-xs"><span className="font-sans text-[var(--ink-soft)]">{label}</span><span>{value === null ? "—" : value.toLocaleString("ja-JP")} kcal</span></div>
    <div className="h-3 overflow-hidden rounded-full bg-[var(--sage-soft)]"><div className={`h-full rounded-full ${color}`} style={{ width: `${value === null ? 0 : Math.min(100, (value / scale) * 100)}%` }} /></div>
  </div>;
}

export function CalorieDifferenceChart({ burned, consumed, loading, burnLoadFailed, mealLoadFailed, incompleteMeals }: {
  burned: number | null;
  consumed: number | null;
  loading: boolean;
  burnLoadFailed: boolean;
  mealLoadFailed: boolean;
  incompleteMeals: boolean;
}) {
  const difference = burnMinusIntake(burned, consumed);
  const scale = Math.max(burned ?? 0, consumed ?? 0, 1);
  const differenceText = difference === null ? "—" : `${difference > 0 ? "+" : ""}${difference.toLocaleString("ja-JP")}`;
  const status = loading ? "記録を読み込み中…"
    : burnLoadFailed || mealLoadFailed ? "記録を読み込めませんでした。ページを再読み込みしてください。"
    : burned === null ? "筋トレ画面で、その日の総消費カロリーを入力すると表示されます。"
    : consumed === null ? "食事のカロリーを記録すると表示されます。"
    : incompleteMeals ? "カロリー未入力の食事は差の計算に含まれていません。" : null;

  return <div className="mt-6 border-t border-[var(--line)] pt-5" aria-label="消費カロリーから摂取カロリーを引いた差">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="text-sm font-bold">今日の消費 − 摂取</h3>
      <p className={`metric text-xl font-semibold ${difference === null ? "text-[var(--muted)]" : difference >= 0 ? "text-[var(--sage-deep)]" : "text-[var(--coral)]"}`}>{differenceText} kcal</p>
    </div>
    <p className="mt-1 text-xs text-[var(--muted)]">入力した総消費カロリーから、食事の摂取カロリーを引いた値</p>
    <div className="mt-4 space-y-3">
      <CalorieBar label="消費カロリー（手入力）" value={burned} scale={scale} color="bg-[var(--coral)]" />
      <CalorieBar label="摂取カロリー（食事）" value={consumed} scale={scale} color="bg-[var(--sage-deep)]" />
    </div>
    <div className="mt-4 border-t border-[var(--line)] pt-3">
      <p className="mb-2 text-xs font-semibold text-[var(--ink-soft)]">差（消費 − 摂取）</p>
      <div className="relative h-4 overflow-hidden rounded-full bg-[var(--sage-soft)]" role="img" aria-label={`差：${differenceText} kcal`}>
        {difference !== null && difference !== 0 && <div className={`absolute inset-y-0 ${difference > 0 ? "left-1/2 bg-[var(--sage-deep)]" : "right-1/2 bg-[var(--coral)]"}`} style={{ width: `${Math.min(50, (Math.abs(difference) / scale) * 50)}%` }} />}
        <span className="absolute inset-y-0 left-1/2 w-px bg-[var(--ink-soft)]" />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-[var(--muted)]"><span>摂取が多い</span><span>0</span><span>消費が多い</span></div>
    </div>
    {status && <p className="mt-3 text-xs leading-5 text-[var(--muted)]">{status}</p>}
    {!loading && !burnLoadFailed && burned === null && <Link href="/workouts" className="text-link mt-2">消費カロリーを記録する</Link>}
  </div>;
}
