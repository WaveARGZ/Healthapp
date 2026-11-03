import Link from "next/link";
import { burnMinusIntake } from "@/lib/utils/daily-burn";

export function CalorieDifferenceChart({ burned, consumed, calorieGoal, loading, burnLoadFailed, mealLoadFailed, incompleteMeals }: {
  burned: number | null;
  consumed: number | null;
  calorieGoal: number | null;
  loading: boolean;
  burnLoadFailed: boolean;
  mealLoadFailed: boolean;
  incompleteMeals: boolean;
}) {
  const difference = burnMinusIntake(burned, consumed);
  const scale = Math.max(calorieGoal ?? 0, burned ?? 0, consumed ?? 0, 1);
  const differenceText = difference === null ? "—" : `${difference > 0 ? "+" : ""}${difference.toLocaleString("ja-JP")}`;
  const status = loading ? "記録を読み込み中…"
    : burnLoadFailed || mealLoadFailed ? "記録を読み込めませんでした。ページを再読み込みしてください。"
    : burned === null ? "筋トレ画面で、その日の総消費カロリーを入力すると表示されます。"
    : consumed === null ? "食事のカロリーを記録すると表示されます。"
    : incompleteMeals ? "カロリー未入力の食事は差の計算に含まれていません。" : null;

  return <div className="mt-6 border-t border-[var(--line)] pt-5" aria-label="消費カロリーと摂取との差">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="text-sm font-bold">今日の消費カロリー</h3>
      <p className="metric text-sm font-bold">{burned === null ? "—" : burned.toLocaleString("ja-JP")} kcal</p>
    </div>
    <div className="mt-4 h-5 overflow-hidden rounded-full bg-[var(--sage-soft)]" role="img" aria-label={`今日の消費カロリー：${burned === null ? "未入力" : `${burned.toLocaleString("ja-JP")} kcal`}`}>
      <div className="h-full rounded-full bg-[var(--coral)]" style={{ width: `${burned === null ? 0 : Math.min(100, (burned / scale) * 100)}%` }} />
    </div>
    <p className="mt-2 text-xs text-[var(--muted)]">手入力した、その日の総消費カロリー</p>
    <div className="mt-5 border-t border-[var(--line)] pt-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold">消費 − 摂取</h3>
        <p className={`metric text-xl font-semibold ${difference === null ? "text-[var(--muted)]" : difference >= 0 ? "text-[var(--sage-deep)]" : "text-[var(--coral)]"}`}>{differenceText} kcal</p>
      </div>
      <div className="relative h-4 overflow-hidden rounded-full bg-[var(--sage-soft)]" role="img" aria-label={`差：${differenceText} kcal`}>
        {difference !== null && difference !== 0 && <div className={`absolute inset-y-0 ${difference > 0 ? "left-1/2 bg-[var(--sage-deep)]" : "right-1/2 bg-[var(--coral)]"}`} style={{ width: `${Math.min(50, (Math.abs(difference) / scale) * 50)}%` }} />}
        <span className="absolute inset-y-0 left-1/2 w-px bg-[var(--ink-soft)]" />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-[var(--muted)]"><span>摂取が多い</span><span>0</span><span>消費が多い</span></div>
      <p className="mt-2 text-xs text-[var(--muted)]">上の摂取量を総消費カロリーから引いた値</p>
    </div>
    {status && <p className="mt-3 text-xs leading-5 text-[var(--muted)]">{status}</p>}
    {!loading && !burnLoadFailed && burned === null && <Link href="/workouts" className="text-link mt-2">消費カロリーを記録する</Link>}
  </div>;
}
