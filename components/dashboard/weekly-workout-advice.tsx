import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { muscleGroups } from "@/lib/workouts/muscle-activity";
import { summarizeWeeklyWorkoutAdvice } from "@/lib/workouts/weekly-advice";
import type { FitnessGoal } from "@/types/user";
import type { WorkoutEntry } from "@/types/workout";

interface WeeklyWorkoutAdviceProps {
  workouts: WorkoutEntry[];
  today: string;
  goal: FitnessGoal | null;
  loading: boolean;
  workoutUnavailable: boolean;
  profileUnavailable: boolean;
}

function shortDate(date: string): string {
  const [, month, day] = date.split("-");
  return `${Number(month)}/${Number(day)}`;
}

export function WeeklyWorkoutAdvice({ workouts, today, goal, loading, workoutUnavailable, profileUnavailable }: WeeklyWorkoutAdviceProps) {
  const advice = summarizeWeeklyWorkoutAdvice(workouts, today, goal);
  return <section aria-labelledby="weekly-workout-advice-title" aria-busy={loading} className="mt-8 overflow-hidden rounded-2xl border border-[var(--line)] bg-white">
    <div className="bg-[var(--sage-soft)] px-5 py-5 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold tracking-widest text-[var(--sage-deep)]"><Icon name="sparkle" className="size-4" />WEEKLY REVIEW</p>
          <h2 id="weekly-workout-advice-title" className="section-title mt-2">週間の筋トレアドバイス</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">直近7日間・{shortDate(advice.startDate)}〜{shortDate(advice.endDate)}</p>
        </div>
        <span className="rounded-full border border-[#c8d8c7] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--sage-deep)]">端末内で自動分析</span>
      </div>
      {!loading && !workoutUnavailable && <div className="mt-5 grid grid-cols-3 gap-2 sm:max-w-lg sm:gap-3">
        {[["記録した日", `${advice.trainingDays}日`], ["筋トレ", `${advice.strengthDays}日`], ["有酸素", `${advice.cardioDays}日`]].map(([label, value]) =>
          <div key={label} className="rounded-lg bg-white px-2 py-3 text-center sm:px-4"><p className="text-[11px] text-[var(--muted)]">{label}</p><p className="metric mt-1 text-xl font-semibold text-[var(--sage-deep)]">{value}</p></div>) }
      </div>}
    </div>
    {loading || workoutUnavailable ? <p className="px-5 py-6 text-sm text-[var(--muted)] sm:px-6">{loading ? "筋トレ記録を読み込み中…" : "筋トレ記録を読み込めませんでした。再読み込みしてお試しください。"}</p>
      : <div className="px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
        <div className="grid gap-4 lg:grid-cols-3">
          <article className="border-b border-[var(--line)] pb-4 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-4">
            <h3 className="text-sm font-bold text-[var(--ink)]">続ける力</h3>
            <p className="mt-2 text-sm leading-7 text-[var(--ink-soft)]">{advice.encouragement}</p>
          </article>
          <article className="border-b border-[var(--line)] pb-4 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-4">
            <h3 className="text-sm font-bold text-[var(--ink)]">部位のバランス</h3>
            <p className="mt-2 text-sm leading-7 text-[var(--ink-soft)]">{advice.balance}</p>
            {advice.trainingDays > 0 && <div className="mt-3 flex flex-wrap gap-1.5" aria-label="部位ごとの記録日数">
              {muscleGroups.map((group) => <span key={group} className={`rounded-full px-2.5 py-1 text-[11px] ${advice.muscleDays[group] > 0 ? "bg-[var(--sage-soft)] text-[var(--sage-deep)]" : "bg-[var(--sand)] text-[var(--muted)]"}`}>{group} {advice.muscleDays[group]}日</span>)}
            </div>}
          </article>
          <article>
            <h3 className="text-sm font-bold text-[var(--ink)]">目標とのつながり</h3>
            <p className="mt-2 text-sm leading-7 text-[var(--ink-soft)]">{profileUnavailable ? "目標を読み込めなかったため、記録とのつながりは表示できません。" : advice.goal}</p>
            {!profileUnavailable && <p className="mt-3 rounded-lg bg-[var(--sand)] px-3 py-2.5 text-xs leading-6 text-[var(--ink-soft)]"><strong className="text-[var(--sage-deep)]">次の一歩：</strong>{advice.nextStep}</p>}
            {!goal && !profileUnavailable && <Link href="/onboarding" className="text-link mt-2">目標を設定<Icon name="arrow-right" className="size-3.5" /></Link>}
          </article>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-[var(--line)] pt-3">
          <p className="text-xs leading-5 text-[var(--muted)]">入力された記録だけで作る自動コメントです。部位は種目名から推定し、フォーム・運動強度・体型への効果量は判定できません。外部AIへ記録を送信しません。</p>
          <Link href="/workouts" className="text-link shrink-0">筋トレ記録を見る<Icon name="arrow-right" className="size-3.5" /></Link>
        </div>
      </div>}
  </section>;
}
