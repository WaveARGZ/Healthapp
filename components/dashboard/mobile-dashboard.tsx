import Link from "next/link";
import { AnatomyFigure } from "@/components/dashboard/anatomy-figure";
import { PersonalNutritionGuide } from "@/components/dashboard/personal-nutrition-guide";
import { summarizeMuscleActivity } from "@/lib/workouts/muscle-activity";
import { burnMinusIntake } from "@/lib/utils/daily-burn";
import type { summarizeDailyMacros } from "@/lib/utils/meal-macros";
import type { DailyFeedbackItem } from "@/lib/utils/daily-feedback";
import type { WorkoutEntry } from "@/types/workout";
import type { UserProfile } from "@/types/user";

type DailyMacros = ReturnType<typeof summarizeDailyMacros>;
const positiveBalanceColor = "#9c5149";
const negativeBalanceColor = "#4d6875";

function amount(value: number | null) {
  return value === null ? "—" : Math.round(value).toLocaleString("ja-JP");
}

function grams(macros: DailyMacros, key: "proteinG" | "fatG" | "carbsG", loading: boolean) {
  return loading || macros.mealCount === 0 || macros.knownCounts[key] === 0
    ? "—" : Math.round(macros[key]).toLocaleString("ja-JP");
}

export function MobileDashboard({ today, doneCount, weight, goal, profile, macros, intake, consumed, burned, incompleteCalories, workouts, feedback, loading, profileUnavailable, mealUnavailable, burnUnavailable, workoutUnavailable, error }: {
  today: string;
  doneCount: number;
  weight: number | null;
  goal: string;
  profile: UserProfile | null;
  macros: DailyMacros;
  intake: number | null;
  consumed: number | null;
  burned: number | null;
  incompleteCalories: boolean;
  workouts: WorkoutEntry[];
  feedback: { meal: DailyFeedbackItem; workout: DailyFeedbackItem };
  loading: boolean;
  profileUnavailable: boolean;
  mealUnavailable: boolean;
  burnUnavailable: boolean;
  workoutUnavailable: boolean;
  error: string;
}) {
  const macroEnergy = macros.proteinG * 4 + macros.fatG * 9 + macros.carbsG * 4;
  const macroUnavailable = loading || mealUnavailable;
  const macroRows = ([
    { key: "proteinG", label: "P", name: "たんぱく質", energy: macros.proteinG * 4, color: "#52654f" },
    { key: "fatG", label: "F", name: "脂質", energy: macros.fatG * 9, color: "#a1a1aa" },
    { key: "carbsG", label: "C", name: "炭水化物", energy: macros.carbsG * 4, color: "#d4d4d8" },
  ] as const).map((row) => ({
    ...row,
    amount: grams(macros, row.key, macroUnavailable),
    percentage: !macroUnavailable && macros.knownCounts[row.key] > 0 ? (macroEnergy > 0 ? Math.round(row.energy / macroEnergy * 100) : 0) : null,
  }));
  const difference = burnMinusIntake(burned, consumed);
  const activity = summarizeMuscleActivity(workouts, today);
  const differenceText = difference === null ? "—" : `${difference > 0 ? "+" : ""}${difference.toLocaleString("ja-JP")}`;
  const differenceStatus = difference === null ? "収支は未計算" : difference > 0 ? "消費が多い" : difference < 0 ? "摂取が多い" : "消費と摂取が同じ";
  const differenceColor = difference === null || difference === 0 ? "var(--ink)" : difference > 0 ? positiveBalanceColor : negativeBalanceColor;
  const proteinEnd = macroEnergy > 0 ? (macros.proteinG * 4 / macroEnergy) * 100 : 0;
  const fatEnd = macroEnergy > 0 ? proteinEnd + (macros.fatG * 9 / macroEnergy) * 100 : 0;
  const intakeRing = macroUnavailable || macroEnergy === 0 ? "var(--sage-soft)"
    : `conic-gradient(#52654f 0 ${proteinEnd}%, #a1a1aa ${proteinEnd}% ${fatEnd}%, #d4d4d8 ${fatEnd}% 100%)`;
  const balanceRing = difference === null || difference === 0 ? "var(--sage-soft)" : differenceColor;
  const calorieStatus = loading || mealUnavailable ? null
    : macros.mealCount === 0 ? "まだ食事の記録はありません。"
    : intake === null ? "食事は記録済みですが、カロリーは未入力です。収支は計算できません。"
    : incompleteCalories ? "カロリーと収支は入力済み分で計算しています。未入力の料理・食事は含みません。"
    : null;
  const macroStatus = loading || mealUnavailable || macros.incompleteMeals === 0 ? null
    : Object.values(macros.knownCounts).some((count) => count > 0)
      ? "PFCは入力済み分の合計です。未入力の栄養素は含みません。"
      : "PFCは未入力です。";
  const calorieDescription = calorieStatus ? "mobile-calorie-status" : undefined;
  const intakeDescription = [calorieDescription, macroStatus ? "mobile-macro-status" : null].filter(Boolean).join(" ") || undefined;

  return <div className="mobile-dashboard space-y-6 sm:space-y-8 lg:grid lg:grid-cols-[1.1fr_.9fr] lg:items-start lg:gap-6 lg:space-y-0" aria-busy={loading}>
    <header className="border-b border-[var(--line)] pb-7 sm:pb-10 lg:col-span-2">
      <p className="mb-3 text-[11px] font-bold tracking-[.16em] text-[var(--sage-deep)]">YOUR DAILY JOURNAL</p>
      <div className="flex items-end justify-between gap-3"><h1 className="text-[clamp(2rem,7vw,3rem)] font-bold leading-none tracking-[-.045em] text-[var(--ink)]">今日の記録</h1><strong className="metric text-xl font-semibold text-[var(--ink)] sm:text-3xl">{loading ? "—" : doneCount}<span className="text-sm font-normal text-[var(--muted)]"> / 3</span></strong></div>
      <p className="mt-4 text-sm text-[var(--muted)]">{weight === null ? "体重未登録" : `${weight.toLocaleString("ja-JP")} kg`} · {goal}</p>
    </header>
    {error && <p role="alert" className="text-xs text-[var(--coral)]">{error}</p>}

    <section aria-labelledby="mobile-calories-title" className="rounded-xl border border-[var(--line)] bg-white p-5 sm:p-8 lg:col-span-2">
      <h2 id="mobile-calories-title" className="text-xl font-bold tracking-[-.03em] text-[var(--ink)] sm:text-2xl">今日の栄養とカロリー</h2>
      <div className="mt-6 grid grid-cols-[1.1fr_.9fr] gap-3 sm:mt-8 sm:grid-cols-[1.2fr_.8fr] sm:gap-5">
        <Link href="/meals" className="flex min-w-0 flex-col items-start rounded-lg border border-[var(--line)] bg-[var(--canvas)] p-3 transition-[background-color,border-color] hover:border-[var(--muted)] hover:bg-white sm:p-6" aria-describedby={intakeDescription} aria-label={`食事を開く。摂取 ${amount(intake)} kcal。PFC：${macroRows.map((row) => `${row.name} ${row.amount === "—" ? "未計算" : `${row.amount}g、${row.percentage}%`}`).join("、")}`}>
          <span className="text-xs font-bold sm:text-sm">摂取・PFC</span>
          <span className="mt-2 grid size-[84px] shrink-0 place-items-center rounded-full p-[9px] sm:size-[124px] sm:p-[12px]" style={{ background: intakeRing }}><span className="flex size-full flex-col items-center justify-center rounded-full bg-white text-center"><strong className="metric text-base leading-none sm:text-xl">{amount(intake)}</strong><small className="mt-0.5 text-[10px] text-[var(--muted)]">摂取 kcal</small></span></span>
          <span className="mt-3 w-full text-left text-[11px] font-semibold text-[var(--muted)] sm:text-xs">PFC · カロリー比</span>
          <span className="mt-1 w-full space-y-0.5" aria-label="PFCの内訳">{macroRows.map((row) => <span key={row.key} className="flex items-center gap-1 text-[11px] sm:text-xs"><span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: row.color }} /><span className="font-bold">{row.label}</span><span className="metric ml-auto whitespace-nowrap">{row.amount === "—" ? "—" : `${row.amount}g · ${row.percentage}%`}</span></span>)}</span>
        </Link>
        <Link href="/progress" className="flex min-w-0 flex-col items-start rounded-lg border border-[var(--line)] bg-white p-3 transition-[background-color,border-color] hover:border-[var(--muted)] hover:bg-[var(--canvas)] sm:p-6" aria-describedby={calorieDescription} aria-label={`進捗を開く。消費 ${amount(burned)} kcal。消費から摂取を引いた収支 ${differenceText} kcal。${differenceStatus}`}>
          <span className="text-xs font-bold sm:text-sm">収支</span>
          <span className="mt-2 grid size-[84px] shrink-0 place-items-center rounded-full p-[9px] sm:size-[124px] sm:p-[12px]" style={{ background: balanceRing }}><span className="flex size-full flex-col items-center justify-center rounded-full bg-white text-center"><strong className="metric text-sm leading-none sm:text-lg" style={{ color: differenceColor }}>{differenceText}</strong><small className="mt-0.5 text-[10px] text-[var(--muted)]">収支 kcal</small></span></span>
          <span className="mt-3 text-left text-[11px] font-semibold sm:text-xs" style={{ color: differenceColor }}>{differenceStatus}</span>
          <span className="mt-1 w-full space-y-0.5 text-[11px] sm:text-xs"><span className="flex items-center justify-between gap-1">消費<span className="metric whitespace-nowrap">{amount(burned)} kcal</span></span><span className="flex items-center justify-between gap-1">摂取<span className="metric whitespace-nowrap">{amount(consumed)} kcal</span></span></span>
        </Link>
      </div>
      {calorieStatus && <p id="mobile-calorie-status" className="mt-1 text-xs leading-5 text-[var(--muted)]">{calorieStatus}</p>}
      {macroStatus && <p id="mobile-macro-status" className="mt-1 text-xs leading-5 text-[var(--muted)]">{macroStatus}</p>}
      {(mealUnavailable || burnUnavailable) && <p className="mt-1 text-[11px] text-[var(--coral)]">一部の記録を表示できません。</p>}
      <PersonalNutritionGuide profile={profile} weightKg={weight} loading={loading} unavailable={profileUnavailable} />
    </section>

    <Link href="/workouts" className="block rounded-xl border border-[var(--line)] bg-white p-5 transition-[background-color,border-color] hover:border-[var(--muted)] hover:bg-[var(--canvas)] sm:p-8" aria-label="筋トレを開く。筋トレ部位マップと記録日数を見る">
      <h2 className="text-xl font-bold tracking-[-.03em] sm:text-2xl">筋トレ部位マップ <span aria-hidden="true" className="float-right text-[var(--sage-deep)]">›</span></h2>
      <div className="mt-1 flex items-center justify-center gap-3" role="img" aria-label="正面と背面の筋トレ部位マップ。記録日数に応じて部位の色が変わります"><AnatomyFigure view="front" activity={activity} compact /><AnatomyFigure view="back" activity={activity} compact /></div>
      <div className="mt-1 flex items-center justify-center gap-1.5 text-[11px] text-[var(--muted)]" aria-label="0日は緑の輪郭、1日は薄い赤、2日以上は濃い赤">
        <span className="size-3 rounded-full border-2 border-[var(--sage-deep)] bg-white" />0日 <span aria-hidden="true">→</span>
        <span className="size-3 rounded-full bg-[#e2bfb9]" />1日 <span aria-hidden="true">→</span>
        <span className="size-3 rounded-full bg-[#ca8b80]" />2日以上
      </div>
      {workoutUnavailable && <p className="mt-1 text-[11px] text-[var(--coral)]">筋トレ記録を表示できません。</p>}
    </Link>

    <section aria-labelledby="mobile-feedback-title" className="rounded-xl border border-[var(--line)] bg-white p-5 sm:p-8">
      <h2 id="mobile-feedback-title" className="text-xl font-bold tracking-[-.03em] sm:text-2xl">食事と筋トレのふり返り</h2>
      <div className="mt-5 divide-y divide-[var(--line)]">
        {(["meal", "workout"] as const).map((kind) => {
          const item = feedback[kind];
          const unavailable = kind === "meal" ? mealUnavailable : workoutUnavailable;
          return <Link key={kind} href={item.href} className="flex min-h-12 items-center gap-2 py-1 hover:bg-[var(--sage-soft)] sm:min-h-16">
            <span className="min-w-0 flex-1"><span className="block text-[11px] font-bold text-[var(--sage-deep)] sm:text-xs">{kind === "meal" ? "食事" : "筋トレ"} · 自動コメント</span><span className="block truncate text-xs text-[var(--ink)] sm:whitespace-normal sm:text-sm">{loading ? "記録を読み込み中…" : unavailable ? "記録を読み込めませんでした" : item.title}</span></span><span aria-hidden="true" className="text-[var(--sage-deep)]">›</span>
          </Link>;
        })}
      </div>
    </section>
  </div>;
}
