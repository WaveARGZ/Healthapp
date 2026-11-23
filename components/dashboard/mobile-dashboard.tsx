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
const displayDate = new Intl.DateTimeFormat("ja-JP", { month: "long", day: "numeric", weekday: "long" });
const expenditureHigherColor = "#4d6875";
const intakeHigherColor = "#9c5149";

function amount(value: number | null) {
  return value === null ? "—" : Math.round(value).toLocaleString("ja-JP");
}

function range(min: number, max: number) {
  return min === max ? min.toLocaleString("ja-JP") : `${min.toLocaleString("ja-JP")}～${max.toLocaleString("ja-JP")}`;
}

function targetRatio(recorded: number | null, max: number | undefined) {
  return recorded !== null && max !== undefined && max > 0 ? Math.round(recorded / max * 100) : null;
}

function IntakeTargetMeter({ label, recorded, min, max, unit, color, targetColor }: {
  label: string;
  recorded: number | null;
  min: number;
  max: number;
  unit: "kcal" | "g";
  color: string;
  targetColor: string;
}) {
  const scale = Math.max(max * 1.25, recorded ?? 0, 1);
  const targetWidth = max / scale * 100;
  const recordedWidth = (recorded ?? 0) / scale * 100;
  const targetText = `目安${range(min, max)} ${unit}`;
  const valueText = recorded === null
    ? `未入力。${targetText}`
    : `記録${recorded} ${unit}、${targetText}、上限比${targetRatio(recorded, max)}%`;

  return <span className="relative col-span-full mt-3 block h-3 w-full rounded-full bg-[var(--sage-soft)]" role="meter"
    aria-label={label} aria-valuemin={0} aria-valuemax={scale} aria-valuenow={recorded ?? undefined} aria-valuetext={valueText}>
    <span className="absolute inset-y-0 left-0 block rounded-full" style={{ width: `${targetWidth}%`, backgroundColor: targetColor }} aria-hidden="true" />
    <span className="absolute inset-y-0 left-0 block rounded-full" style={{ width: `${recordedWidth}%`, backgroundColor: color }} aria-hidden="true" />
    <span className="absolute top-4 h-2 w-0.5 -translate-x-1/2 rounded-full bg-[var(--ink-soft)]" style={{ left: `${targetWidth}%` }} aria-hidden="true" />
    {recorded !== null && <span className="absolute -top-[3px] z-10 size-[18px] -translate-x-1/2 rounded-full border-[3px] border-white" style={{ left: `${recordedWidth}%`, backgroundColor: color }} aria-hidden="true" />}
  </span>;
}

function recordedGrams(macros: DailyMacros, key: "proteinG" | "fatG" | "carbsG", loading: boolean) {
  return loading || macros.mealCount === 0 || macros.knownCounts[key] === 0
    ? null : Math.round(macros[key]);
}

export function MobileDashboard({ today, recordedToday, currentWeightKg, profile, macros, intake, consumed, burned, burnRestingOnly, burnNeedsProfile, incompleteCalories, workouts, feedback, loading, profileUnavailable, weightsUnavailable, mealUnavailable, burnUnavailable, workoutUnavailable, error }: {
  today: string;
  recordedToday: RecordedToday;
  currentWeightKg?: number;
  profile: UserProfile | null;
  macros: DailyMacros;
  intake: number | null;
  consumed: number | null;
  burned: number | null;
  burnRestingOnly: boolean;
  burnNeedsProfile: boolean;
  incompleteCalories: boolean;
  workouts: WorkoutEntry[];
  feedback: { meal: DailyFeedbackItem; workout: DailyFeedbackItem };
  loading: boolean;
  profileUnavailable: boolean;
  weightsUnavailable: boolean;
  mealUnavailable: boolean;
  burnUnavailable: boolean;
  workoutUnavailable: boolean;
  error: string;
}) {
  const recordsKnown = !loading && Object.values(recordedToday).every((value) => value !== null);
  const doneCount = Object.values(recordedToday).filter(Boolean).length;
  const macroUnavailable = loading || mealUnavailable;
  const guideUnavailable = profileUnavailable ? "profile" : weightsUnavailable ? "weight" : null;
  const guide = profile && !guideUnavailable ? estimateDailyCalorieGuide({
    age: profile.age,
    gender: profile.gender,
    heightCm: profile.heightCm,
    weightKg: currentWeightKg,
    goal: profile.goal,
  }) : { status: "missing-profile" as const };
  const macroGuide = guide.status === "ready" && profile ? estimateDailyMacroGuide(guide, profile.goal) : null;
  const intakeTarget = guide.status === "ready" ? range(guide.minKcal, guide.maxKcal) : null;
  const intakeRatio = targetRatio(consumed, guide.status === "ready" ? guide.maxKcal : undefined);
  const macroRows = ([
    { key: "proteinG", label: "P", name: "たんぱく質", target: macroGuide?.protein, color: "#4f7668", targetColor: "#dce8e2" },
    { key: "fatG", label: "F", name: "脂質", target: macroGuide?.fat, color: "#947449", targetColor: "#eee3d1" },
    { key: "carbsG", label: "C", name: "炭水化物", target: macroGuide?.carbs, color: "#9f6257", targetColor: "#f0dfda" },
  ] as const).map((row) => {
    const recordedG = recordedGrams(macros, row.key, macroUnavailable);
    return {
      ...row,
      recordedG,
      amount: recordedG === null ? "—" : recordedG.toLocaleString("ja-JP"),
      targetRatio: targetRatio(recordedG, row.target?.maxG),
    };
  });
  const difference = burnMinusIntake(burned, consumed);
  const activity = summarizeMuscleActivity(workouts, today);
  const differenceText = difference === null ? "—" : `${difference > 0 ? "+" : ""}${difference.toLocaleString("ja-JP")}`;
  const differenceStatus = difference === null ? "収支は未計算" : difference > 0 ? "消費が多い" : difference < 0 ? "摂取が多い" : "消費と摂取が同じ";
  const differenceColor = difference === null || difference === 0 ? "var(--ink)" : difference > 0 ? expenditureHigherColor : intakeHigherColor;
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
  const balanceDescription = [calorieDescription, difference !== null ? "mobile-balance-note" : null].filter(Boolean).join(" ") || undefined;

  return <div className="mobile-dashboard grid min-w-0 gap-5 sm:gap-7" aria-busy={loading}>
    <header>
      {!loading && <time dateTime={today} className="mb-2 block text-sm font-semibold text-[var(--sage-deep)]">{displayDate.format(new Date(`${today}T12:00:00`))}</time>}
      <h1 className="text-[clamp(1.75rem,5vw,2.25rem)] font-bold leading-tight tracking-[-.045em] text-[var(--ink)]">今日の記録</h1>
    </header>
    {error && <p role="alert" className="rounded-lg bg-[var(--coral-soft)] px-4 py-3 text-sm text-[var(--coral)]">{error}</p>}

    <section aria-labelledby="record-status-title" className="min-w-0">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="record-status-title" className="text-base font-semibold">記録する</h2>
        <span className="text-sm text-[var(--muted)]">{recordsKnown ? `${doneCount} / 3 記録済み` : "確認中"}</span>
      </div>
      <div className="grid grid-cols-3 divide-x divide-[var(--line)] overflow-hidden rounded-lg border border-[var(--line)] bg-white">
        {recordDestinations.map(({ key, title, href }) => {
          const done = recordedToday[key];
          const state = loading ? "読込中" : done === null ? "取得できません" : done ? "記録済み" : "追加する";
          return <Link key={key} href={href} aria-label={`${title}の記録を開く（${state}）`}
            className="flex min-h-24 min-w-0 flex-col items-start justify-center gap-2 px-4 py-4 transition-colors hover:bg-[var(--sage-soft)] sm:px-6">
            <span className="text-base font-semibold text-[var(--ink)]">{title}</span>
            <span className="text-sm text-[var(--sage-deep)]">{done && !loading ? "✓ " : "＋ "}{state}</span>
          </Link>;
        })}
      </div>
    </section>

    <section aria-labelledby="mobile-calories-title" className="min-w-0 border-t border-[var(--line)] pt-5">
      <h2 id="mobile-calories-title" className="section-title">今日の食事</h2>
      <div className="mt-4 grid grid-cols-2 divide-x divide-[var(--line)]">
        <Link href="/meals" className="block min-w-0 pr-4 transition-colors hover:text-[var(--sage-deep)] sm:pr-6" aria-describedby={intakeDescription} aria-label={"食事を開く。摂取 " + amount(intake) + " kcal。PFC：" + macroRows.map((row) => row.name + " " + (row.amount === "—" ? "未入力" : row.amount + "g、" + (row.targetRatio === null ? "目安上限比は未計算" : `目安上限比${row.targetRatio}%`))).join("、") + (intakeTarget ? "。1日の目安 " + intakeTarget + " kcal" : "")}>
          <span className="flex items-center justify-between text-base font-bold text-[var(--ink)]">摂取カロリー</span>
          <span className="mt-3 block">
            <span className="block min-w-0">
              <strong className="metric block text-[clamp(1.5rem,5vw,2rem)] font-semibold leading-tight text-[var(--ink)]">{amount(intake)} <small className="text-sm font-medium">kcal</small></strong>
            </span>
          </span>
          {guide.status === "ready" && <>
            <IntakeTargetMeter label="今日の摂取カロリー" recorded={consumed} min={guide.minKcal} max={guide.maxKcal}
              unit="kcal" color="var(--sage-deep)" targetColor="color-mix(in srgb, var(--sage-deep) 22%, white)" />
            <span className="mt-4 block text-sm leading-5 text-[var(--ink-soft)]">
              <span>1日の摂取目安</span>{" "}<strong className="metric inline-block font-semibold">{intakeTarget} kcal</strong>
            </span>
            {intakeRatio !== null && <span className="mt-1 block text-xs text-[var(--muted)]">目安上限比 {intakeRatio}%</span>}
          </>}
        </Link>
        <Link href="/progress" className="block min-w-0 pl-4 transition-colors hover:text-[var(--sage-deep)] sm:pl-6" aria-describedby={balanceDescription} aria-label={`進捗を開く。消費から摂取を引いた収支 ${differenceText} kcal。${differenceStatus}`}>
          <span className="flex items-center justify-between text-base font-bold text-[var(--ink)]">カロリー収支</span>
          <span className="mt-3 block">
            <span className="block min-w-0">
              <strong className="metric block text-[clamp(1.5rem,5vw,2rem)] font-semibold leading-tight" style={{ color: differenceColor }}>{differenceText} <small className="text-sm font-medium">kcal</small></strong>
              <span className="mt-1 block text-sm font-semibold" style={{ color: differenceColor }}>{differenceStatus}</span>
              {difference !== null && <span id="mobile-balance-note" className="mt-2 block text-xs leading-5 text-[var(--muted)]">
                ※基礎代謝の値を考慮した数値です{burnRestingOnly && <span className="block">活動消費は未記録です。</span>}
              </span>}
            </span>
          </span>
        </Link>
      </div>
      {calorieStatus && <p id="mobile-calorie-status" className="mt-3 text-sm leading-6 text-[var(--muted)]">{calorieStatus}</p>}
      {burnNeedsProfile && <p className="mt-3 text-sm text-[var(--muted)]">基礎代謝を推定できないため、収支は未計算です。 <Link href="/onboarding" className="text-link">プロフィールを確認</Link></p>}
      {(mealUnavailable || burnUnavailable) && <p className="mt-3 text-sm text-[var(--coral)]">一部の記録を表示できません。</p>}
      <Link href="/meals" className="mt-4 block border-t border-[var(--line)] pt-4 transition-colors hover:bg-[var(--canvas)]">
        <h3 className="text-base font-bold text-[var(--ink)]">PFCの摂取量</h3>
        {macroGuide && <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-[var(--muted)]">
          <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2 rounded-full bg-[var(--sage-deep)]" />濃色：今日の記録</span>
          <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2 rounded-full border border-[var(--field-line)] bg-[var(--line)]" />淡色：1日の目安</span>
        </p>}
        <div className="mt-2 grid gap-x-5 gap-y-1 sm:grid-cols-3" aria-label="PFCの記録と目安">{macroRows.map((row) => <div key={row.key} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 border-t border-[var(--line)] py-3 sm:block">
          <span className="inline-flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--ink-soft)]"><span className="text-sm font-semibold" style={{ color: row.color }}>{row.label}</span>{row.name}</span>
          <span className="flex flex-wrap items-baseline justify-end gap-x-2 sm:mt-2 sm:justify-between">
            <strong className="metric text-2xl font-semibold text-[var(--ink)]">{row.amount === "—" ? "—" : `${row.amount}g`}</strong>
            {(row.recordedG !== null || row.target) && <span className="text-xs text-[var(--muted)]">目安上限比 {row.targetRatio === null ? "—" : `${row.targetRatio}%`}</span>}
          </span>
          {row.target && <IntakeTargetMeter label={`${row.name}の摂取量`} recorded={row.recordedG} min={row.target.minG} max={row.target.maxG}
            unit="g" color={row.color} targetColor={row.targetColor} />}
          {row.target && <span className="metric col-span-full mt-4 block text-sm leading-6 text-[var(--ink-soft)]">目安：{range(row.target.minG, row.target.maxG)} g</span>}
        </div>)}</div>
      </Link>
      {macroStatus && <p id="mobile-macro-status" className="mt-3 text-sm leading-6 text-[var(--muted)]">{macroStatus}</p>}
      <PersonalNutritionGuide guide={guide} loading={loading} unavailable={guideUnavailable} />
    </section>

    <div className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
      <details className="py-1">
        <summary className="min-h-14 cursor-pointer py-4 text-base font-semibold text-[var(--ink)]">筋トレ部位マップ</summary>
        <div className="pb-5">
          <p className="text-sm text-[var(--muted)]">過去14日間の記録日数</p>
          <div className="mt-3 flex items-center justify-center gap-3" role="img" aria-label="正面と背面の筋トレ部位マップ。記録日数に応じて部位の色が変わります"><AnatomyFigure view="front" activity={activity} compact /><AnatomyFigure view="back" activity={activity} compact /></div>
          <div className="mt-3 flex items-center justify-center gap-4 text-sm text-[var(--muted)]" aria-label="0日は輪郭のみ、1日は薄い赤、2日以上は濃い赤">
            <span className="inline-flex items-center gap-1.5"><span className="size-3 border border-[var(--muted)] bg-white" />0日</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-3 bg-[#e2bfb9]" />1日</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-3 bg-[#ca8b80]" />2日以上</span>
          </div>
          {workoutUnavailable && <p className="mt-2 text-sm text-[var(--coral)]">筋トレ記録を表示できません。</p>}
          <Link href="/workouts" className="text-link mt-2">筋トレの記録を見る</Link>
        </div>
      </details>
      <details className="py-1">
        <summary className="min-h-14 cursor-pointer py-4 text-base font-semibold text-[var(--ink)]">記録のふり返り</summary>
        <div className="divide-y divide-[var(--line)] pb-3">
          {(["meal", "workout"] as const).map((kind) => {
            const item = feedback[kind];
            const unavailable = kind === "meal" ? mealUnavailable : workoutUnavailable;
            return <Link key={kind} href={item.href} className="block min-h-16 py-3 hover:bg-[var(--sage-soft)]">
              <span className="block text-sm font-semibold text-[var(--sage-deep)]">{kind === "meal" ? "食事" : "筋トレ"}</span>
              <span className="mt-1 block text-sm leading-6 text-[var(--ink)]">{loading ? "記録を読み込み中…" : unavailable ? "記録を読み込めませんでした" : item.title}</span>
            </Link>;
          })}
        </div>
      </details>
    </div>
  </div>;
}
