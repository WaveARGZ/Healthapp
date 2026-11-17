import Link from "next/link";
import { AnatomyFigure } from "@/components/dashboard/anatomy-figure";
import { PersonalNutritionGuide } from "@/components/dashboard/personal-nutrition-guide";
import { summarizeMuscleActivity } from "@/lib/workouts/muscle-activity";
import { burnMinusIntake } from "@/lib/utils/daily-burn";
import { estimateDailyCalorieGuide, estimateDailyMacroGuide } from "@/lib/utils/daily-calorie-guide";
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

function range(min: number, max: number) {
  return min === max ? min.toLocaleString("ja-JP") : `${min.toLocaleString("ja-JP")}～${max.toLocaleString("ja-JP")}`;
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
  const macroRatioReady = !macroUnavailable && macros.mealCount > 0 && macros.incompleteMeals === 0
    && Object.values(macros.knownCounts).every((count) => count === macros.mealCount) && macroEnergy > 0;
  const guide = profile && !profileUnavailable ? estimateDailyCalorieGuide({ age: profile.age, gender: profile.gender, heightCm: profile.heightCm, weightKg: weight ?? undefined, goal: profile.goal }) : { status: "missing-profile" as const };
  const macroGuide = guide.status === "ready" && profile ? estimateDailyMacroGuide(guide, profile.goal) : null;
  const intakeTarget = guide.status === "ready" ? range(guide.minKcal, guide.maxKcal) : null;
  const burnTarget = guide.status === "ready" ? range(guide.minNonRestingKcal, guide.maxNonRestingKcal) : null;
  const intakeProgress = guide.status === "ready" && intake !== null ? Math.min(100, Math.max(0, intake / guide.maxKcal * 100)) : 0;
  const macroRows = ([
    { key: "proteinG", label: "P", name: "たんぱく質", energy: macros.proteinG * 4, target: macroGuide?.protein, color: "#4f7668", targetColor: "#dce8e2" },
    { key: "fatG", label: "F", name: "脂質", energy: macros.fatG * 9, target: macroGuide?.fat, color: "#947449", targetColor: "#eee3d1" },
    { key: "carbsG", label: "C", name: "炭水化物", energy: macros.carbsG * 4, target: macroGuide?.carbs, color: "#9f6257", targetColor: "#f0dfda" },
  ] as const).map((row) => ({
    ...row,
    amount: grams(macros, row.key, macroUnavailable),
    percentage: macroRatioReady ? Math.round(row.energy / macroEnergy * 100) : null,
  }));
  const difference = burnMinusIntake(burned, consumed);
  const activity = summarizeMuscleActivity(workouts, today);
  const differenceText = difference === null ? "—" : `${difference > 0 ? "+" : ""}${difference.toLocaleString("ja-JP")}`;
  const differenceStatus = difference === null ? "収支は未計算" : difference > 0 ? "消費が多い" : difference < 0 ? "摂取が多い" : "消費と摂取が同じ";
  const differenceColor = difference === null || difference === 0 ? "var(--ink)" : difference > 0 ? positiveBalanceColor : negativeBalanceColor;
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
      <div className="flex items-end justify-between gap-3"><h1 className="text-[clamp(2rem,7vw,3rem)] font-bold leading-none tracking-[-.045em] text-[var(--ink)]">今日の記録</h1><strong className="metric text-xl font-semibold text-[var(--ink)] sm:text-3xl">{loading ? "—" : doneCount}<span className="text-sm font-normal text-[var(--muted)]"> / 3</span></strong></div>
      <p className="mt-4 text-sm text-[var(--muted)]">{weight === null ? "体重未登録" : `${weight.toLocaleString("ja-JP")} kg`} · {goal}</p>
    </header>
    {error && <p role="alert" className="text-xs text-[var(--coral)]">{error}</p>}

    <Link href="/weekly-review" className="flex min-h-14 items-center justify-between rounded-full border border-[var(--line)] bg-white px-5 text-base font-bold text-[var(--ink)] transition-[background-color,border-color] hover:border-[var(--sage-deep)] hover:bg-[var(--sage-soft)] lg:col-span-2">
      1週間のふり返り <span aria-hidden="true" className="text-xl font-normal text-[var(--sage-deep)]">›</span>
    </Link>

    <section aria-labelledby="mobile-calories-title" className="rounded-xl border border-[var(--line)] bg-white p-5 sm:p-8 lg:col-span-2">
      <h2 id="mobile-calories-title" className="text-xl font-bold tracking-[-.03em] text-[var(--ink)] sm:text-2xl">今日の栄養とカロリー</h2>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm font-semibold">
        <span className="inline-flex items-center gap-1.5 text-[var(--ink-soft)]"><span className="size-2 rounded-full bg-[var(--sage-deep)]" />濃色：今日の記録</span>
        <span className="inline-flex items-center gap-1.5 text-[var(--muted)]"><span className="size-2 rounded-full bg-[#dce8dc]" />淡色：1日の目安</span>
      </div>
      <div className="mt-5 grid grid-cols-2 border-t border-[var(--line)]">
        <Link href="/meals" className="block min-w-0 border-r border-[var(--line)] py-5 pr-3 transition-colors hover:bg-[var(--canvas)] sm:py-8 sm:pr-8" aria-describedby={intakeDescription} aria-label={"食事を開く。摂取 " + amount(intake) + " kcal。PFC：" + macroRows.map((row) => row.name + " " + (row.amount === "—" ? "未計算" : row.amount + "g、" + (row.percentage === null ? "カロリー比未計算" : row.percentage + "%"))).join("、") + (intakeTarget ? "。1日の摂取目安 " + intakeTarget + " kcal" : "")}>
          <span className="flex items-center justify-between text-base font-bold text-[var(--ink)]">摂取 <span aria-hidden="true" className="text-[var(--sage-deep)]">›</span></span>
          <span className="mt-5 block">
            <span className="block min-w-0">
              <strong className="metric block text-[clamp(1.5rem,6vw,2.2rem)] font-bold leading-tight text-[var(--ink)]">{amount(intake)} <small className="text-sm font-medium">kcal</small></strong>
              <span className="mt-3 block text-sm font-semibold text-[#607960]">1日の目安</span>
              <span className="metric block text-sm font-semibold text-[#607960]">{intakeTarget ?? "—"} kcal</span>
            </span>
          </span>
          {intakeTarget && <span className="mt-4 block h-2.5 w-full overflow-hidden rounded-full bg-[#dce8dc]" aria-hidden="true"><span className="block h-full rounded-full bg-[var(--sage-deep)]" style={{ width: String(intakeProgress) + "%" }} /></span>}
        </Link>
        <Link href="/progress" className="block min-w-0 py-5 pl-3 transition-colors hover:bg-[var(--canvas)] sm:py-8 sm:pl-8" aria-describedby={calorieDescription} aria-label={"進捗を開く。消費 " + amount(burned) + " kcal。消費から摂取を引いた収支 " + differenceText + " kcal。" + differenceStatus + (burnTarget ? "。活動による消費の推定 " + burnTarget + " kcal" : "")}>
          <span className="flex items-center justify-between text-base font-bold text-[var(--ink)]">収支 <span aria-hidden="true" className="text-[var(--sage-deep)]">›</span></span>
          <span className="mt-5 block">
            <span className="block min-w-0">
              <strong className="metric block text-[clamp(1.5rem,6vw,2.2rem)] font-bold leading-tight" style={{ color: differenceColor }}>{differenceText} <small className="text-sm font-medium">kcal</small></strong>
              <span className="mt-1 block text-sm font-semibold" style={{ color: differenceColor }}>{differenceStatus}</span>
              <span className="mt-3 block text-sm text-[var(--ink-soft)]">記録した消費 {amount(burned)} kcal</span>
              <span className="mt-1 block text-sm text-[#607960]">活動による消費の推定 {burnTarget ?? "—"} kcal</span>
            </span>
          </span>
        </Link>
      </div>
      <Link href="/meals" className="block border-t border-[var(--line)] py-4 transition-colors hover:bg-[var(--canvas)]">
        <p className="text-base font-semibold text-[var(--ink-soft)]">PFC・カロリー比</p>
        <div className="mt-4 grid gap-5 sm:grid-cols-3" aria-label="PFCの記録と目安">{macroRows.map((row) => <div key={row.key} className="min-w-0">
          <span className="flex items-baseline justify-between gap-2"><span className="text-sm font-semibold text-[var(--ink-soft)]">{row.label} {row.name}</span><strong className="metric whitespace-nowrap text-base text-[var(--ink)]">{row.amount === "—" ? "—" : `${row.amount}g · ${row.percentage === null ? "—" : `${row.percentage}%`}`}</strong></span>
          <span className="relative mt-3 block h-3 w-full rounded-full bg-[var(--sage-soft)]" role="meter" aria-label={`${row.name}のカロリー比`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={row.percentage ?? undefined} aria-valuetext={row.percentage === null ? "未計算" : `記録${row.percentage}%、目安${row.target ? `${row.target.percent}%` : "未設定"}`}>
            <span className="absolute inset-y-0 left-0 block rounded-full" style={{ width: `${row.target?.percent ?? 0}%`, backgroundColor: row.targetColor }} aria-hidden="true" />
            <span className="absolute inset-y-0 left-0 block rounded-full" style={{ width: `${row.percentage ?? 0}%`, backgroundColor: row.color }} aria-hidden="true" />
            {row.target && <span className="absolute -top-[3px] z-10 size-[18px] -translate-x-1/2 rounded-full border-[3px] border-white" style={{ left: `${row.target.percent}%`, backgroundColor: row.color }} aria-hidden="true" />}
          </span>
          <span className="metric mt-2 block text-[15px] font-semibold leading-6 text-[var(--ink-soft)]">目安：{row.target ? `${range(row.target.minG, row.target.maxG)} g（比率 ${row.target.percent}%）` : "—"}</span>
        </div>)}</div>
      </Link>
      {calorieStatus && <p id="mobile-calorie-status" className="mt-1 text-xs leading-5 text-[var(--muted)]">{calorieStatus}</p>}
      {macroStatus && <p id="mobile-macro-status" className="mt-1 text-xs leading-5 text-[var(--muted)]">{macroStatus}</p>}
      {(mealUnavailable || burnUnavailable) && <p className="mt-1 text-[11px] text-[var(--coral)]">一部の記録を表示できません。</p>}
      <PersonalNutritionGuide profile={profile} weightKg={weight} loading={loading} unavailable={profileUnavailable} />
    </section>

    <Link href="/workouts" className="block rounded-xl border border-[var(--line)] bg-white p-5 transition-[background-color,border-color] hover:border-[var(--muted)] hover:bg-[var(--canvas)] sm:p-8" aria-label="筋トレを開く。筋トレ部位マップと記録日数を見る">
      <h2 className="text-xl font-bold tracking-[-.03em] sm:text-2xl">筋トレ部位マップ <span aria-hidden="true" className="float-right text-[var(--sage-deep)]">›</span></h2>
      <div className="mt-1 flex items-center justify-center gap-3" role="img" aria-label="正面と背面の筋トレ部位マップ。記録日数に応じて部位の色が変わります"><AnatomyFigure view="front" activity={activity} compact /><AnatomyFigure view="back" activity={activity} compact /></div>
      <div className="mt-1 flex items-center justify-center gap-1.5 text-sm text-[var(--muted)]" aria-label="0日は緑の輪郭、1日は薄い赤、2日以上は濃い赤">
        <span className="size-3 rounded-full border-2 border-[var(--sage-deep)] bg-white" />0日 <span aria-hidden="true">→</span>
        <span className="size-3 rounded-full bg-[#e2bfb9]" />1日 <span aria-hidden="true">→</span>
        <span className="size-3 rounded-full bg-[#ca8b80]" />2日以上
      </div>
      {workoutUnavailable && <p className="mt-1 text-[11px] text-[var(--coral)]">筋トレ記録を表示できません。</p>}
    </Link>

    <section aria-labelledby="mobile-feedback-title" className="rounded-xl border border-[var(--line)] bg-white p-5 sm:p-8">
      <h2 id="mobile-feedback-title" className="text-xl font-bold tracking-[-.03em] sm:text-2xl">今日のひとこと</h2>
      <div className="mt-5 divide-y divide-[var(--line)]">
        {(["meal", "workout"] as const).map((kind) => {
          const item = feedback[kind];
          const unavailable = kind === "meal" ? mealUnavailable : workoutUnavailable;
          return <Link key={kind} href={item.href} className="flex min-h-12 items-center gap-2 py-1 hover:bg-[var(--sage-soft)] sm:min-h-16">
            <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-[var(--sage-deep)]">{kind === "meal" ? "食事" : "筋トレ"}</span><span className="block text-sm leading-6 text-[var(--ink)]">{loading ? "記録を読み込み中…" : unavailable ? "記録を読み込めませんでした" : item.title}</span></span><span aria-hidden="true" className="text-[var(--sage-deep)]">›</span>
          </Link>;
        })}
      </div>
    </section>
  </div>;
}
