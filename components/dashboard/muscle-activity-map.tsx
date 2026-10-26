import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { AnatomyFigure, activityColors } from "@/components/dashboard/anatomy-figure";
import { muscleGroups, summarizeMuscleActivity, type MuscleGroup } from "@/lib/workouts/muscle-activity";
import type { WorkoutEntry } from "@/types/workout";

const muscleLabels: Record<MuscleGroup, string> = {
  "胸": "胸", "背中": "背中", "腕": "腕", "肩": "肩", "腹筋・体幹": "腹筋", "脚": "脚",
};

function colorFor(days: number): string { return activityColors[Math.min(days, 3)]; }

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
              <span className="flex min-w-0 items-center gap-2"><span className="size-3 shrink-0 rounded-full border border-[#ced9cf]" style={{ backgroundColor: colorFor(activity[group]) }} /><span className="truncate">{muscleLabels[group]}</span></span>
              <strong className="metric shrink-0 text-xs">{activity[group]}日</strong>
            </div>)}
          </div>
          <div className="mt-5">
            <p className="text-xs font-semibold text-[var(--ink-soft)]">色の目安</p>
            <div className="mt-2 grid grid-cols-4 gap-1 text-center text-[10px] text-[var(--muted)]">
              {["0日", "1日", "2日", "3日以上"].map((label, index) => <div key={label}><span className="mx-auto mb-1 block h-3 w-full max-w-9 rounded-sm border border-[#ced9cf]" style={index === 0 ? { backgroundImage: "conic-gradient(#d5ded7 25%, #fff 0 50%, #d5ded7 0 75%, #fff 0)", backgroundSize: "8px 8px" } : { backgroundColor: activityColors[index] }} />{label}</div>)}
            </div>
          </div>
        </div>
      </div>
      <p className="mt-4 text-xs leading-5 text-[var(--muted)]">同じ日の複数セット・種目は各部位につき1日として数えます。0日は透明、1日は緑、2日は青、3日以上は元の色です。種目名から部位を判定できない記録は色に含みません。14日間に記録がなければ透明に戻ります。</p>
    </>}
  </section>;
}
