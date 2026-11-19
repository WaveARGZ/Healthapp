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
type RecordedToday = { workout: boolean | null; meal: boolean | null; weight: boolean | null };
const recordDestinations = [
  { key: "workout", title: "筋トレ", href: "/workouts" },
  { key: "meal", title: "食事", href: "/meals" },
  { key: "weight", title: "体重", href: "/weight" },
] as const;
const journalDate = new Intl.DateTimeFormat("ja-JP", { month: "long", day: "numeric", weekday: "long" });
const positiveBalanceColor = "#9c5149";
const negativeBalanceColor = "#4d6875";

function amount(value: number | null) {
  return value === null ? "—" : Math.round(value).toLocaleString("ja-JP");
}

function range(min: number, max: number) {
  return min === max ? min.toLocaleString("ja-JP") : `${min.toLocaleString("ja-JP")}～${max.toLocaleString("ja-JP")}`;
}

function recordedGrams(macros: DailyMacros, key: "proteinG" | "fatG" | "carbsG", loading: boolean) {
  return loading || macros.mealCount === 0 || macros.knownCounts[key] === 0
    ? null : Math.round(macros[key]);
}

export function MobileDashboard({ today, recordedToday, weight, goal, profile, macros, intake, consumed, burned, incompleteCalories, workouts, feedback, loading, profileUnavailable, mealUnavailable, burnUnavailable, workoutUnavailable, error }: {
  today: string;
  recordedToday: RecordedToday;
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
  const recordsKnown = !loading && Object.values(recordedToday).every((value) => value !== null);
  const doneCount = Object.values(recordedToday).filter(Boolean).length;
  const macroUnavailable = loading || mealUnavailable;
  const guide = profile && !profileUnavailable ? estimateDailyCalorieGuide({ age: profile.age, gender: profile.gender, heightCm: profile.heightCm, weightKg: weight ?? undefined, goal: profile.goal }) : { status: "missing-profile" as const };
  const macroGuide = guide.status === "ready" && profile ? estimateDailyMacroGuide(guide, profile.goal) : null;
  const intakeTarget = guide.status === "ready" ? range(guide.minKcal, guide.maxKcal) : null;
  const burnTarget = guide.status === "ready" ? range(guide.minNonRestingKcal, guide.maxNonRestingKcal) : null;
  const intakeProgress = guide.status === "ready" && intake !== null ? Math.min(100, Math.max(0, intake / guide.maxKcal * 100)) : 0;
  const macroRows = ([
    { key: "proteinG", label: "P", name: "たんぱく質", target: macroGuide?.protein, color: "#4f7668", targetColor: "#dce8e2" },
    { key: "fatG", label: "F", name: "脂質", target: macroGuide?.fat, color: "#947449", targetColor: "#eee3d1" },
    { key: "carbsG", label: "C", name: "炭水化物", target: macroGuide?.carbs, color: "#9f6257", targetColor: "#f0dfda" },
  ] as const).map((row) => {
    const recordedG = recordedGrams(macros, row.key, macroUnavailable);
    const scaleG = Math.max((row.target?.maxG ?? 0) * 1.25, recordedG ?? 0, 1);
    return {
      ...row,
      recordedG,
      scaleG,
      amount: recordedG === null ? "—" : recordedG.toLocaleString("ja-JP"),
      targetRatio: row.target && row.target.maxG > 0 && recordedG !== null ? Math.round(recordedG / row.target.maxG * 100) : null,
      recordedWidth: recordedG === null ? 0 : recordedG / scaleG * 100,
      targetWidth: row.target ? row.target.maxG / scaleG * 100 : 0,
    };
  });
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

  return <div className="mobile-dashboard grid min-w-0 gap-5 sm:gap-7" aria-busy={loading}>
    <header>
      {!loading && <time dateTime={today} className="mb-2 block text-sm font-semibold text-[var(--sage-deep)]">{journalDate.format(new Date(`${today}T12:00:00`))}</time>}
      <h1 className="text-[clamp(2rem,6vw,3rem)] font-bold leading-tight tracking-[-.045em] text-[var(--ink)]">今日の記録</h1>
    </header>
    {error && <p role="alert" className="rounded-lg bg-[var(--coral-soft)] px-4 py-3 text-sm text-[var(--coral)]">{error}</p>}

    <section aria-labelledby="record-status-title" className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white sm:grid sm:grid-cols-[minmax(10rem,.65fr)_minmax(0,1.5fr)]">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 bg-[#234b39] px-5 py-4 text-white sm:block sm:p-6">
        <h2 id="record-status-title" className="text-base font-semibold">記録した項目</h2>
        <p className="metric flex items-baseline gap-2 sm:mt-2">
          <strong className="text-3xl leading-none font-medium sm:text-5xl">{recordsKnown ? doneCount : "—"}</strong>
          <span className="text-base text-[#e2ecdf]">/ 3</span>
        </p>
      </div>
      <div className="grid grid-cols-3 divide-x divide-[var(--line)]">
        {recordDestinations.map(({ key, title, href }) => {
          const done = recordedToday[key];
          const state = loading ? "読込中" : done === null ? "取得できません" : done ? "記録済み" : "記録する";
          return <Link key={key} href={href} aria-label={`${title}の記録を開く（${state}）`}
            className="group flex min-w-0 flex-col items-center justify-center gap-1.5 px-2 py-5 text-center transition-colors hover:bg-[var(--sage-soft)]">
            <span className={`grid size-8 place-items-center rounded-full text-xl leading-none ${done && !loading ? "bg-[var(--sage-deep)] text-white" : "bg-[var(--sage-soft)] text-[var(--sage-deep)]"}`} aria-hidden="true">{done && !loading ? "✓" : "+"}</span>
            <span className="text-base font-bold text-[var(--ink)]">{title}</span>
            <span className="text-xs font-medium text-[var(--muted)] group-hover:text-[var(--sage-deep)]">{state}</span>
          </Link>;
        })}
      </div>
      {!loading && <div className="col-span-full flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-[var(--line)] bg-[var(--sage-soft)] px-5 py-3 text-sm text-[var(--ink-soft)] sm:px-6">
        <span>直近の体重 <strong className="metric ml-1 font-semibold text-[var(--ink)]">{recordedToday.weight === null ? "確認できません" : weight === null ? "未登録" : `${weight.toLocaleString("ja-JP")} kg`}</strong></span>
        <span>目標 <strong className="ml-1 font-semibold text-[var(--ink)]">{profileUnavailable ? "確認できません" : goal}</strong></span>
      </div>}
    </section>

    <section aria-labelledby="mobile-calories-title" className="min-w-0 rounded-2xl border border-[var(--line)] bg-white p-5 sm:p-7">
      <h2 id="mobile-calories-title" className="section-title">今日の栄養とカロリー</h2>
      <div className="mt-5 grid gap-3 min-[390px]:grid-cols-2">
        <Link href="/meals" className="block min-w-0 rounded-xl border border-transparent bg-[var(--sage-soft)] p-4 transition-colors hover:border-[var(--sage-deep)] sm:p-5" aria-describedby={intakeDescription} aria-label={"食事を開く。摂取 " + amount(intake) + " kcal。PFC：" + macroRows.map((row) => row.name + " " + (row.amount === "—" ? "未入力" : row.amount + "g、" + (row.targetRatio === null ? "目安上限比は未計算" : `目安上限比${row.targetRatio}%`))).join("、") + (intakeTarget ? "。1日の摂取目安 " + intakeTarget + " kcal" : "")}>
          <span className="flex items-center justify-between text-base font-bold text-[var(--ink)]">摂取カロリー <span aria-hidden="true" className="text-[var(--sage-deep)]">›</span></span>
          <span className="mt-3 block">
            <span className="block min-w-0">
              <strong className="metric block text-[clamp(1.8rem,6vw,2.6rem)] font-semibold leading-tight text-[var(--ink)]">{amount(intake)} <small className="text-sm font-medium">kcal</small></strong>
              {intakeTarget && <span className="mt-3 block text-sm text-[var(--ink-soft)]">1日の目安 <span className="metric font-semibold">{intakeTarget} kcal</span></span>}
            </span>
          </span>
          {intakeTarget && <span className="mt-4 block h-2.5 w-full overflow-hidden rounded-full bg-[#dce8dc]" aria-hidden="true"><span className="block h-full rounded-full bg-[var(--sage-deep)]" style={{ width: String(intakeProgress) + "%" }} /></span>}
        </Link>
        <Link href="/progress" className="block min-w-0 rounded-xl border border-transparent bg-[#f6f2ed] p-4 transition-colors hover:border-[var(--sage-deep)] sm:p-5" aria-describedby={calorieDescription} aria-label={"進捗を開く。消費 " + amount(burned) + " kcal。消費から摂取を引いた収支 " + differenceText + " kcal。" + differenceStatus + (burnTarget ? "。活動による消費の推定 " + burnTarget + " kcal" : "")}>
          <span className="flex items-center justify-between text-base font-bold text-[var(--ink)]">カロリー収支 <span aria-hidden="true" className="text-[var(--sage-deep)]">›</span></span>
          <span className="mt-3 block">
            <span className="block min-w-0">
              <strong className="metric block text-[clamp(1.8rem,6vw,2.6rem)] font-semibold leading-tight" style={{ color: differenceColor }}>{differenceText} <small className="text-sm font-medium">kcal</small></strong>
              <span className="mt-1 block text-sm font-semibold" style={{ color: differenceColor }}>{differenceStatus}</span>
              <span className="mt-3 block text-sm text-[var(--ink-soft)]">記録した消費 {amount(burned)} kcal</span>
              {burnTarget && <span className="mt-1 block text-sm text-[var(--ink-soft)]">活動による消費の推定 {burnTarget} kcal</span>}
            </span>
          </span>
        </Link>
      </div>
      {calorieStatus && <p id="mobile-calorie-status" className="mt-3 text-sm leading-6 text-[var(--muted)]">{calorieStatus}</p>}
      {(mealUnavailable || burnUnavailable) && <p className="mt-3 text-sm text-[var(--coral)]">一部の記録を表示できません。</p>}
      <Link href="/meals" className="mt-5 block border-t border-[var(--line)] pt-5 transition-colors hover:bg-[var(--canvas)]">
        <h3 className="text-base font-bold text-[var(--ink)]">PFCの摂取量</h3>
        {macroGuide && <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-[var(--muted)]">
          <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2 rounded-full bg-[var(--sage-deep)]" />濃色：今日の記録</span>
          <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2 rounded-full border border-[#9daea0] bg-[#dce8dc]" />淡色：1日の目安</span>
        </p>}
        <div className="mt-3 grid gap-3 sm:grid-cols-3" aria-label="PFCの記録と目安">{macroRows.map((row) => <div key={row.key} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 rounded-xl bg-[var(--canvas)] px-4 py-3.5 sm:block">
          <span className="inline-flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--ink-soft)]"><span className="grid size-6 place-items-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: row.color }}>{row.label}</span>{row.name}</span>
          <span className="flex flex-wrap items-baseline justify-end gap-x-2 sm:mt-2 sm:justify-between">
            <strong className="metric text-2xl font-semibold text-[var(--ink)]">{row.amount === "—" ? "—" : `${row.amount}g`}</strong>
            {(row.recordedG !== null || row.target) && <span className="text-xs text-[var(--muted)]">目安上限比 {row.targetRatio === null ? "—" : `${row.targetRatio}%`}</span>}
          </span>
          {row.target && <span className="relative col-span-full mt-3 block h-3 w-full rounded-full bg-[var(--sage-soft)]" role="meter" aria-label={`${row.name}の摂取量`} aria-valuemin={0} aria-valuemax={row.scaleG} aria-valuenow={row.recordedG ?? undefined} aria-valuetext={row.recordedG === null ? `未入力。目安${range(row.target.minG, row.target.maxG)}g` : `記録${row.recordedG}g、目安${range(row.target.minG, row.target.maxG)}g、上限比${row.targetRatio}%`}>
            <span className="absolute inset-y-0 left-0 block rounded-full" style={{ width: `${row.targetWidth}%`, backgroundColor: row.targetColor }} aria-hidden="true" />
            <span className="absolute inset-y-0 left-0 block rounded-full" style={{ width: `${row.recordedWidth}%`, backgroundColor: row.color }} aria-hidden="true" />
            <span className="absolute top-4 h-2 w-0.5 -translate-x-1/2 rounded-full bg-[var(--ink-soft)]" style={{ left: `${row.targetWidth}%` }} aria-hidden="true" />
            {row.recordedG !== null && <span className="absolute -top-[3px] z-10 size-[18px] -translate-x-1/2 rounded-full border-[3px] border-white" style={{ left: `${row.recordedWidth}%`, backgroundColor: row.color }} aria-hidden="true" />}
          </span>}
          {row.target && <span className="metric col-span-full mt-4 block text-sm leading-6 text-[var(--ink-soft)]">目安：{range(row.target.minG, row.target.maxG)} g</span>}
        </div>)}</div>
      </Link>
      {macroStatus && <p id="mobile-macro-status" className="mt-3 text-sm leading-6 text-[var(--muted)]">{macroStatus}</p>}
      <PersonalNutritionGuide profile={profile} weightKg={weight} loading={loading} unavailable={profileUnavailable} />
    </section>

    <div className="grid min-w-0 gap-5 md:grid-cols-2 sm:gap-7">
      <Link href="/workouts" className="block min-w-0 rounded-2xl border border-[var(--line)] bg-white p-5 transition-colors hover:border-[var(--sage-deep)] sm:p-6" aria-label="筋トレを開く。筋トレ部位マップと記録日数を見る">
        <h2 className="section-title">筋トレ部位マップ <span aria-hidden="true" className="float-right text-[var(--sage-deep)]">›</span></h2>
        <p className="mt-2 text-sm text-[var(--muted)]">過去14日間の記録日数</p>
        <div className="mt-3 flex items-center justify-center gap-3" role="img" aria-label="正面と背面の筋トレ部位マップ。記録日数に応じて部位の色が変わります"><AnatomyFigure view="front" activity={activity} compact /><AnatomyFigure view="back" activity={activity} compact /></div>
        <div className="mt-1 flex items-center justify-center gap-1.5 text-sm text-[var(--muted)]" aria-label="0日は緑の輪郭、1日は薄い赤、2日以上は濃い赤">
          <span className="size-3 rounded-full border-2 border-[var(--sage-deep)] bg-white" />0日 <span aria-hidden="true">→</span>
          <span className="size-3 rounded-full bg-[#e2bfb9]" />1日 <span aria-hidden="true">→</span>
          <span className="size-3 rounded-full bg-[#ca8b80]" />2日以上
        </div>
        {workoutUnavailable && <p className="mt-2 text-sm text-[var(--coral)]">筋トレ記録を表示できません。</p>}
      </Link>

      <section aria-labelledby="mobile-feedback-title" className="min-w-0 rounded-2xl border border-[var(--line)] bg-white p-5 sm:p-6">
        <h2 id="mobile-feedback-title" className="section-title">今日のひとこと</h2>
        <div className="mt-5 divide-y divide-[var(--line)]">
          {(["meal", "workout"] as const).map((kind) => {
            const item = feedback[kind];
            const unavailable = kind === "meal" ? mealUnavailable : workoutUnavailable;
            return <Link key={kind} href={item.href} className="flex min-h-16 items-center gap-3 py-3 hover:bg-[var(--sage-soft)]">
              <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-[var(--sage-deep)]">{kind === "meal" ? "食事" : "筋トレ"}</span><span className="block text-sm leading-6 text-[var(--ink)]">{loading ? "記録を読み込み中…" : unavailable ? "記録を読み込めませんでした" : item.title}</span></span><span aria-hidden="true" className="text-[var(--sage-deep)]">›</span>
            </Link>;
          })}
        </div>
      </section>
    </div>
  </div>;
}
