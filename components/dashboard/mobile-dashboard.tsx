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
  return loading || macros.mealCount === 0 || macros.knownCounts[key] === 0
    ? "—" : Math.round(macros[key]).toLocaleString("ja-JP");
}

export function MobileDashboard({ today, doneCount, weight, goal, macros, intake, consumed, burned, incompleteCalories, workouts, feedback, loading, mealUnavailable, burnUnavailable, workoutUnavailable, error }: {
  today: string;
  doneCount: number;
  weight: number | null;
  goal: string;
  macros: DailyMacros;
  intake: number | null;
  consumed: number | null;
  burned: number | null;
  incompleteCalories: boolean;
  workouts: WorkoutEntry[];
  feedback: { meal: DailyFeedbackItem; workout: DailyFeedbackItem };
  loading: boolean;
  mealUnavailable: boolean;
  burnUnavailable: boolean;
  workoutUnavailable: boolean;
  error: string;
}) {
  const macroEnergy = macros.proteinG * 4 + macros.fatG * 9 + macros.carbsG * 4;
  const macroUnavailable = loading || mealUnavailable;
  const macroRows = ([
    { key: "proteinG", label: "P", name: "たんぱく質", energy: macros.proteinG * 4, color: "#e989db" },
    { key: "fatG", label: "F", name: "脂質", energy: macros.fatG * 9, color: "#ffd16d" },
    { key: "carbsG", label: "C", name: "炭水化物", energy: macros.carbsG * 4, color: "#aa91ff" },
  ] as const).map((row) => ({
    ...row,
    amount: grams(macros, row.key, macroUnavailable),
    percentage: !macroUnavailable && macros.knownCounts[row.key] > 0 ? (macroEnergy > 0 ? Math.round(row.energy / macroEnergy * 100) : 0) : null,
  }));
  const difference = burnMinusIntake(burned, consumed);
  const activity = summarizeMuscleActivity(workouts, today);
  const differenceText = difference === null ? "—" : `${difference > 0 ? "+" : ""}${difference.toLocaleString("ja-JP")}`;
  const differenceStatus = difference === null ? "収支は未計算" : difference > 0 ? "消費が多い" : difference < 0 ? "摂取が多い" : "消費と摂取が同じ";
  const differenceColor = difference === null || difference === 0 ? "var(--ink)" : difference > 0 ? "var(--sage-deep)" : "var(--coral)";
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

  return <div className="mobile-dashboard space-y-2 sm:space-y-4" aria-busy={loading}>
    <header className="rounded-2xl border border-[var(--line)] border-l-4 border-l-[var(--sage-deep)] bg-white px-3 py-2.5 sm:px-6 sm:py-5">
      <div className="flex items-center justify-between gap-2"><h1 className="text-base font-bold text-[var(--sage-deep)] sm:text-xl">今日の記録</h1><strong className="metric text-lg text-[var(--sage-deep)] sm:text-2xl">{loading ? "—" : doneCount} / 3</strong></div>
      <p className="mt-1 text-xs text-[var(--muted)] sm:text-sm">{weight === null ? "体重未登録" : `${weight.toLocaleString("ja-JP")} kg`} · {goal}</p>
    </header>
    {error && <p role="alert" className="text-xs text-[var(--coral)]">{error}</p>}

    <section aria-labelledby="mobile-calories-title" className="rounded-2xl border border-[var(--line)] bg-white px-3 py-2.5 sm:px-6 sm:py-5">
      <h2 id="mobile-calories-title" className="text-sm font-bold sm:text-lg">今日の栄養とカロリー</h2>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:mt-4 sm:gap-6">
        <Link href="/meals" className="flex min-w-0 flex-col rounded-xl border border-[var(--line)] p-2.5 hover:bg-[var(--sage-soft)] sm:p-4" aria-describedby={intakeDescription} aria-label={`食事を開く。摂取 ${amount(intake)} kcal。PFC：${macroRows.map((row) => `${row.name} ${row.amount === "—" ? "未計算" : `${row.amount}g、${row.percentage}%`}`).join("、")}`}>
          <span className="text-[11px] font-bold text-[var(--muted)] sm:text-sm">摂取カロリー</span>
          <strong className="metric mt-0.5 text-lg leading-tight text-[var(--ink)] sm:text-2xl">{amount(intake)} <small className="text-[11px] font-normal sm:text-sm">kcal</small></strong>
          <span className="mt-2 border-t border-[var(--line)] pt-1.5 text-[10px] font-bold text-[var(--muted)] sm:text-xs">PFC内訳 · カロリー比</span>
          <dl className="mt-1 space-y-1" aria-label="PFCの内訳">
            {macroRows.map((row) => <div key={row.key} className="grid grid-cols-[auto_1fr_auto] items-center gap-1.5 text-[10px] sm:text-xs">
              <dt className="font-bold" aria-label={row.name}>{row.label}</dt>
              <dd className="h-1.5 min-w-0 overflow-hidden rounded-full bg-[var(--sage-soft)]" aria-label={`${row.name}のカロリー比 ${row.percentage === null ? "未計算" : `${row.percentage}%`}`}><span className="block h-full rounded-full" style={{ width: `${row.percentage ?? 0}%`, backgroundColor: row.color }} /></dd>
              <dd className="metric whitespace-nowrap text-right text-[var(--ink)]">{row.amount === "—" ? "—" : `${row.amount}g · ${row.percentage}%`}</dd>
            </div>)}
          </dl>
        </Link>
        <Link href="/progress" className="flex min-w-0 flex-col rounded-xl border border-[var(--line)] p-2.5 hover:bg-[var(--sage-soft)] sm:p-4" aria-describedby={calorieDescription} aria-label={`進捗を開く。消費 ${amount(burned)} kcal。消費から摂取を引いた収支 ${differenceText} kcal。${differenceStatus}`}>
          <span className="text-[11px] font-bold text-[var(--muted)] sm:text-sm">消費カロリー</span>
          <strong className="metric mt-0.5 text-lg leading-tight text-[var(--ink)] sm:text-2xl">{amount(burned)} <small className="text-[11px] font-normal sm:text-sm">kcal</small></strong>
          <span className="mt-2 border-t border-[var(--line)] pt-1.5 text-[10px] font-bold text-[var(--muted)] sm:text-xs">収支 · 消費 − 摂取</span>
          <strong className="metric mt-1 text-lg leading-tight sm:text-2xl" style={{ color: differenceColor }}>{differenceText} <small className="text-[11px] font-normal sm:text-sm">kcal</small></strong>
          <span className="mt-0.5 text-[10px] font-semibold sm:text-xs" style={{ color: differenceColor }}>{differenceStatus}</span>
        </Link>
      </div>
      {calorieStatus && <p id="mobile-calorie-status" className="mt-1 text-xs leading-5 text-[var(--muted)]">{calorieStatus}</p>}
      {macroStatus && <p id="mobile-macro-status" className="mt-1 text-xs leading-5 text-[var(--muted)]">{macroStatus}</p>}
      {(mealUnavailable || burnUnavailable) && <p className="mt-1 text-[11px] text-[var(--coral)]">一部の記録を表示できません。</p>}
    </section>

    <Link href="/workouts" className="block rounded-2xl border border-[var(--line)] bg-white px-3 py-2.5 hover:bg-[var(--sage-soft)] sm:px-6 sm:py-5" aria-label="筋トレを開く。筋トレ部位マップと記録日数を見る">
      <h2 className="text-sm font-bold sm:text-lg">筋トレ部位マップ <span aria-hidden="true" className="float-right text-[var(--sage-deep)]">›</span></h2>
      <div className="mt-1 flex items-center justify-center gap-3" role="img" aria-label="正面と背面の筋トレ部位マップ。記録日数に応じて部位の色が変わります"><AnatomyFigure view="front" activity={activity} compact /><AnatomyFigure view="back" activity={activity} compact /></div>
      <div className="mt-1 flex items-center justify-center gap-1.5 text-[11px] text-[var(--muted)]" aria-label="0日は緑の輪郭、1日は薄い赤、2日以上は濃い赤">
        <span className="size-3 rounded-full border-2 border-[var(--sage-deep)] bg-white" />0日 <span aria-hidden="true">→</span>
        <span className="size-3 rounded-full bg-[#e2bfb9]" />1日 <span aria-hidden="true">→</span>
        <span className="size-3 rounded-full bg-[#ca8b80]" />2日以上
      </div>
      {workoutUnavailable && <p className="mt-1 text-[11px] text-[var(--coral)]">筋トレ記録を表示できません。</p>}
    </Link>

    <section aria-labelledby="mobile-feedback-title" className="rounded-2xl border border-[var(--line)] bg-white px-3 py-2.5 sm:px-6 sm:py-5">
      <h2 id="mobile-feedback-title" className="text-sm font-bold sm:text-lg">食事と筋トレのふり返り</h2>
      <div className="mt-1 divide-y divide-[var(--line)]">
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
