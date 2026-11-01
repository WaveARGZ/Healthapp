import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { AnatomyFigure } from "@/components/dashboard/anatomy-figure";
import { activityTint, maxActivityDays } from "@/components/dashboard/activity-color";
import { muscleGroups, summarizeMuscleActivity, type MuscleGroup } from "@/lib/workouts/muscle-activity";
import type { WorkoutEntry } from "@/types/workout";

const muscleLabels: Record<MuscleGroup, string> = {
  "胸": "胸", "背中": "背中", "腕": "腕", "肩": "肩", "腹筋・体幹": "腹筋", "脚": "脚",
};

const gradientColors = Array.from({ length: maxActivityDays }, (_, index) =>
  `${activityTint(index + 1).color} ${(index / (maxActivityDays - 1)) * 100}%`
).join(", ");

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
            {muscleGroups.map((group) => <div key={group} className="flex items-center justify-between gap-2 border-b border-[var(--line)] py-3 text-sm">
              <span className="flex min-w-0 items-center gap-2"><span className="size-3 shrink-0 rounded-full border border-[#ced9cf]" style={{ backgroundColor: activityTint(activity[group]).color }} /><span className="truncate">{muscleLabels[group]}</span></span>
              <strong className="metric shrink-0 text-xs">{activity[group]}日</strong>
            </div>)}
          </div>
          <div className="mt-5">
            <p className="text-xs font-semibold text-[var(--ink-soft)]">色の目安</p>
            <div className="mt-2 flex items-start gap-3 text-[10px] text-[var(--muted)]">
              <div className="shrink-0 text-center"><span className="mx-auto mb-1 block size-4 rounded-sm border border-[#ced9cf]" style={{ backgroundImage: "conic-gradient(#d5ded7 25%, #fff 0 50%, #d5ded7 0 75%, #fff 0)", backgroundSize: "8px 8px" }} />0日<br />透明</div>
              <div className="min-w-0 flex-1">
                <span className="mb-1 block h-4 rounded-sm border border-[#ced9cf]" style={{ backgroundImage: `linear-gradient(to right, ${gradientColors})` }} />
                <div className="flex justify-between gap-1"><span>1日<br />緑</span><span className="text-center">7日<br />青</span><span className="text-right">14日<br />元の色</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-4 text-xs leading-5 text-[var(--muted)]">同じ日の複数セット・種目は各部位につき1日として数えます。頭は常に元の色です。頭以外は0日は透明、1日は緑から始まり、記録日数に応じて青・紫を経て14日で元の色へ変化します。種目名から部位を判定できない記録は色に含みません。14日間に記録がなければ対象部位は透明に戻ります。</p>
    </>}
  </section>;
}
