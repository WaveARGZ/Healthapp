import Link from "next/link";
import { AnatomyFigure } from "@/components/dashboard/anatomy-figure";
import { summarizeMuscleActivity } from "@/lib/workouts/muscle-activity";
import { burnMinusIntake } from "@/lib/utils/daily-burn";
import type { summarizeDailyMacros } from "@/lib/utils/meal-macros";
import type { DailyFeedbackItem } from "@/lib/utils/daily-feedback";
import type { WorkoutEntry } from "@/types/workout";

type DailyMacros = ReturnType<typeof summarizeDailyMacros>;

function amount(value: number | null) {
  return value === null ? "—" : Math.round(value).toLocaleString("ja-JP");
}

function grams(macros: DailyMacros, key: "proteinG" | "fatG" | "carbsG", loading: boolean) {
  return loading || (macros.mealCount > 0 && macros.knownCounts[key] === 0)
    ? "—" : Math.round(macros[key]).toLocaleString("ja-JP");
}

export function MobileDashboard({ today, doneCount, weight, goal, macros, intake, consumed, burned, calorieGoal, workouts, feedback, loading, mealUnavailable, burnUnavailable, workoutUnavailable, error }: {
  today: string;
  doneCount: number;
  weight: number | null;
  goal: string;
  macros: DailyMacros;
  intake: number | null;
  consumed: number | null;
  burned: number | null;
  calorieGoal: number | null;
  workouts: WorkoutEntry[];
  feedback: { meal: DailyFeedbackItem; workout: DailyFeedbackItem };
  loading: boolean;
  mealUnavailable: boolean;
  burnUnavailable: boolean;
  workoutUnavailable: boolean;
  error: string;
}) {
  const macroEnergy = macros.proteinG * 4 + macros.fatG * 9 + macros.carbsG * 4;
  const proteinEnd = macroEnergy > 0 ? (macros.proteinG * 4 / macroEnergy) * 100 : 0;
  const fatEnd = macroEnergy > 0 ? proteinEnd + (macros.fatG * 9 / macroEnergy) * 100 : 0;
  const intakeRing = loading || mealUnavailable || macroEnergy === 0 ? "var(--sage-soft)"
    : `conic-gradient(#e989db 0 ${proteinEnd}%, #ffd16d ${proteinEnd}% ${fatEnd}%, #aa91ff ${fatEnd}% 100%)`;
  const burnProgress = burned === null ? 0 : Math.min(100, burned / Math.max(calorieGoal ?? 0, burned, 1) * 100);
  const burnRing = `conic-gradient(var(--sage-deep) 0 ${burnProgress}%, var(--sage-soft) ${burnProgress}% 100%)`;
  const difference = burnMinusIntake(burned, consumed);
  const activity = summarizeMuscleActivity(workouts, today);
  const differenceText = difference === null ? "—" : `${difference > 0 ? "+" : ""}${difference.toLocaleString("ja-JP")}`;

  return <div className="mobile-dashboard space-y-2" aria-busy={loading}>
    <header className="rounded-2xl border border-[var(--line)] border-l-4 border-l-[var(--sage-deep)] bg-white px-3 py-2.5">
      <div className="flex items-center justify-between gap-2"><h1 className="text-base font-bold text-[var(--sage-deep)]">今日の記録</h1><strong className="metric text-lg text-[var(--sage-deep)]">{loading ? "—" : doneCount} / 3</strong></div>
      <p className="mt-1 text-xs text-[var(--muted)]">{weight === null ? "体重未登録" : `${weight.toLocaleString("ja-JP")} kg`} · {goal}</p>
    </header>
    {error && <p role="alert" className="text-xs text-[var(--coral)]">{error}</p>}

    <section aria-labelledby="mobile-calories-title" className="rounded-2xl border border-[var(--line)] bg-white px-3 py-2.5">
      <h2 id="mobile-calories-title" className="text-sm font-bold">今日の栄養とカロリー</h2>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Link href="/meals" className="flex min-h-28 min-w-0 flex-col items-center justify-center gap-1 rounded-xl hover:bg-[var(--sage-soft)]" aria-label={`食事を開く。摂取 ${amount(intake)} kcal。PFCの記録を見る`}>
          <span className="grid size-[76px] place-items-center rounded-full p-[9px]" style={{ background: intakeRing }}><span className="flex size-full flex-col items-center justify-center rounded-full bg-white text-center"><strong className="metric text-sm leading-none">{amount(intake)}</strong><small className="mt-0.5 text-[11px] text-[var(--muted)]">kcal</small></span></span>
          <span className="text-xs font-bold">摂取・PFC</span>
          <span className="metric whitespace-nowrap text-[11px] text-[var(--muted)]">P{grams(macros, "proteinG", loading)} · F{grams(macros, "fatG", loading)} · C{grams(macros, "carbsG", loading)}g</span>
        </Link>
        <Link href="/progress" className="flex min-h-28 min-w-0 flex-col items-center justify-center gap-1 rounded-xl hover:bg-[var(--sage-soft)]" aria-label={`進捗を開く。消費 ${amount(burned)} kcal。消費から摂取を引いた差 ${differenceText} kcal`}>
          <span className="grid size-[76px] place-items-center rounded-full p-[9px]" style={{ background: burnRing }}><span className="flex size-full flex-col items-center justify-center rounded-full bg-white text-center"><strong className="metric text-sm leading-none">{amount(burned)}</strong><small className="mt-0.5 text-[11px] text-[var(--muted)]">kcal</small></span></span>
          <span className="text-xs font-bold">消費・収支</span>
          <span className="metric whitespace-nowrap text-[11px] text-[var(--muted)]">消費 − 摂取 {differenceText} kcal</span>
        </Link>
      </div>
      {(mealUnavailable || burnUnavailable) && <p className="mt-1 text-[11px] text-[var(--coral)]">一部の記録を表示できません。</p>}
    </section>

    <Link href="/workouts" className="block rounded-2xl border border-[var(--line)] bg-white px-3 py-2.5 hover:bg-[var(--sage-soft)]" aria-label="筋トレを開く。筋トレ部位マップと記録日数を見る">
      <h2 className="text-sm font-bold">筋トレ部位マップ <span aria-hidden="true" className="float-right text-[var(--sage-deep)]">›</span></h2>
      <div className="mt-1 flex items-center justify-center gap-3" role="img" aria-label="正面と背面の筋トレ部位マップ。記録日数に応じて部位の色が変わります"><AnatomyFigure view="front" activity={activity} compact /><AnatomyFigure view="back" activity={activity} compact /></div>
      <div className="mt-1 flex items-center justify-center gap-1.5 text-[11px] text-[var(--muted)]" aria-label="0日は緑の輪郭、1日は薄い赤、2日以上は濃い赤">
        <span className="size-3 rounded-full border-2 border-[var(--sage-deep)] bg-white" />0日 <span aria-hidden="true">→</span>
        <span className="size-3 rounded-full bg-[#e2bfb9]" />1日 <span aria-hidden="true">→</span>
        <span className="size-3 rounded-full bg-[#ca8b80]" />2日以上
      </div>
      {workoutUnavailable && <p className="mt-1 text-[11px] text-[var(--coral)]">筋トレ記録を表示できません。</p>}
    </Link>

    <section aria-labelledby="mobile-feedback-title" className="rounded-2xl border border-[var(--line)] bg-white px-3 py-2.5">
      <h2 id="mobile-feedback-title" className="text-sm font-bold">食事と筋トレのふり返り</h2>
      <div className="mt-1 divide-y divide-[var(--line)]">
        {(["meal", "workout"] as const).map((kind) => {
          const item = feedback[kind];
          const unavailable = kind === "meal" ? mealUnavailable : workoutUnavailable;
          return <Link key={kind} href={item.href} className="flex min-h-12 items-center gap-2 py-1 hover:bg-[var(--sage-soft)]">
            <span className="min-w-0 flex-1"><span className="block text-[11px] font-bold text-[var(--sage-deep)]">{kind === "meal" ? "食事" : "筋トレ"} · 自動コメント</span><span className="block truncate text-xs text-[var(--ink)]">{loading ? "記録を読み込み中…" : unavailable ? "記録を読み込めませんでした" : item.title}</span></span><span aria-hidden="true" className="text-[var(--sage-deep)]">›</span>
          </Link>;
        })}
      </div>
    </section>
  </div>;
}
