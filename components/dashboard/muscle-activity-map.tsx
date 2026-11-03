import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { AnatomyFigure } from "@/components/dashboard/anatomy-figure";
import { activityTint, inactiveOutlineColor } from "@/components/dashboard/activity-color";
import { muscleGroups, summarizeMuscleActivity, type MuscleGroup } from "@/lib/workouts/muscle-activity";
import type { WorkoutEntry } from "@/types/workout";

const muscleLabels: Record<MuscleGroup, string> = {
  "胸": "胸", "背中": "背中", "腕": "腕", "肩": "肩", "腹筋・体幹": "腹筋", "脚": "脚",
};

const activityStages = [
  { days: 0, label: "外枠のみ" },
  { days: 1, label: "薄い赤" },
  { days: 2, label: "元の赤" },
] as const;

export function MuscleActivityMap({ workouts, today, loading, unavailable }: { workouts: WorkoutEntry[]; today: string; loading: boolean; unavailable: boolean }) {
  const activity = summarizeMuscleActivity(workouts, today);

  return <section aria-labelledby="muscle-activity-title" aria-busy={loading} className="mt-8 rounded-2xl border border-[var(--line)] bg-[var(--sand)] p-4 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold tracking-widest text-[var(--sage-deep)]">TRAINING MAP</p>
        <h2 id="muscle-activity-title" className="section-title mt-1">筋トレ部位マップ</h2>
        <p className="mt-2 text-xs leading-5 text-[var(--muted)]">今日を含む直近14日間の記録日数</p>
      </div>
      <Link href="/workouts" className="text-link">筋トレを記録<Icon name="arrow-right" className="size-3.5" /></Link>
    </div>
    {loading || unavailable ? <p className="mt-5 text-sm text-[var(--muted)]">{loading ? "筋トレ記録を読み込み中…" : "筋トレ記録を読み込めませんでした。再読み込みしてお試しください。"}</p> : <>
      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(230px,0.8fr)] lg:items-start">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AnatomyFigure view="front" activity={activity} />
          <AnatomyFigure view="back" activity={activity} />
        </div>
        <div className="rounded-xl border border-[var(--line)] bg-white p-4 sm:p-5">
          <h3 className="text-sm font-bold">部位ごとの記録日数</h3>
          <div className="mt-3 grid grid-cols-2 gap-x-4">
            {muscleGroups.map((group) => {
              const tint = activityTint(activity[group]);
              return <div key={group} className="flex items-center justify-between gap-2 border-b border-[var(--line)] py-3 text-sm">
                <span className="flex min-w-0 items-center gap-2"><span className="size-3 shrink-0 rounded-full border-2" style={{ backgroundColor: tint.color, borderColor: tint.opacity === 0 ? inactiveOutlineColor : tint.color }} /><span className="truncate">{muscleLabels[group]}</span></span>
                <strong className="metric shrink-0 text-xs">{activity[group]}日</strong>
              </div>;
            })}
          </div>
          <div className="mt-5">
            <p className="text-xs font-semibold text-[var(--ink-soft)]">記録日数で変化</p>
            <div className="mt-2 flex items-stretch gap-1" aria-label="0日から2日以上までの色の変化">
              {activityStages.map((stage, index) => <div key={stage.days} className="contents">
                {index > 0 && <span className="self-center text-xs font-bold text-[var(--muted)]" aria-hidden="true">→</span>}
                <div className="flex min-w-0 flex-1 flex-col items-center rounded-lg border border-[var(--line)] bg-[var(--sand)] px-1 py-2 text-center">
                  <span className="mb-1.5 size-6 rounded-full border-2" style={{ borderColor: stage.days === 0 ? inactiveOutlineColor : activityTint(stage.days).color, backgroundColor: stage.days === 0 ? "white" : activityTint(stage.days).color }} />
                  <strong className="text-[11px] leading-tight">{stage.days === 2 ? "2日以上" : `${stage.days}日`}</strong>
                  <span className="mt-1 text-[10px] leading-tight text-[var(--muted)]">{stage.label}</span>
                </div>
              </div>)}
            </div>
            <p className="mt-2 text-[11px] leading-4 text-[var(--muted)]">同じ部位を別の日に記録すると、次の段階へ進みます。</p>
          </div>
        </div>
      </div>
      <p className="mt-4 text-xs leading-5 text-[var(--muted)]">同じ日の複数セット・種目は、各部位につき1日として数えます。今日を含む14日間に記録がなければ0日に戻ります。頭は記録がある間、元の色で表示します。部位を判定できない種目は対象外です。</p>
    </>}
  </section>;
}
