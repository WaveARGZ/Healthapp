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
  const proteinEnd = macroEnergy > 0 ? (macros.proteinG * 4 / macroEnergy) * 100 : 0;
  const fatEnd = macroEnergy > 0 ? proteinEnd + (macros.fatG * 9 / macroEnergy) * 100 : 0;
  const intakeRing = macroUnavailable || macroEnergy === 0 ? "var(--sage-soft)"
    : `conic-gradient(#e989db 0 ${proteinEnd}%, #ffd16d ${proteinEnd}% ${fatEnd}%, #aa91ff ${fatEnd}% 100%)`;
  const comparedCalories = difference === null ? 0 : Math.max(0, burned ?? 0) + Math.max(0, consumed ?? 0);
  const burnShare = comparedCalories > 0 ? Math.max(0, burned ?? 0) / comparedCalories * 100 : 0;
  const balanceRing = comparedCalories === 0 ? "var(--sage-soft)"
    : `conic-gradient(var(--sage-deep) 0 ${burnShare}%, var(--coral) ${burnShare}% 100%)`;
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
        <Link href="/meals" className="flex min-w-0 flex-col items-center rounded-xl border border-[var(--line)] p-2.5 hover:bg-[var(--sage-soft)] sm:p-4" aria-describedby={intakeDescription} aria-label={`食事を開く。摂取 ${amount(intake)} kcal。PFC：${macroRows.map((row) => `${row.name} ${row.amount === "—" ? "未計算" : `${row.amount}g、${row.percentage}%`}`).join("、")}`}>
          <span className="text-[11px] font-bold sm:text-sm">摂取・PFC</span>
          <span className="mt-1 grid size-[76px] shrink-0 place-items-center rounded-full p-[9px] sm:size-[124px] sm:p-[12px]" style={{ background: intakeRing }}><span className="flex size-full flex-col items-center justify-center rounded-full bg-white text-center"><strong className="metric text-sm leading-none sm:text-xl">{amount(intake)}</strong><small className="mt-0.5 text-[10px] text-[var(--muted)]">摂取 kcal</small></span></span>
          <span className="mt-1 w-full text-center text-[10px] font-semibold text-[var(--muted)] sm:text-xs">PFC · カロリー比</span>
          <span className="mt-0.5 w-full space-y-0.5" aria-label="PFCの内訳">{macroRows.map((row) => <span key={row.key} className="flex items-center gap-1 text-[10px] sm:text-xs"><span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: row.color }} /><span className="font-bold">{row.label}</span><span className="metric ml-auto whitespace-nowrap">{row.amount === "—" ? "—" : `${row.amount}g · ${row.percentage}%`}</span></span>)}</span>
        </Link>
        <Link href="/progress" className="flex min-w-0 flex-col items-center rounded-xl border border-[var(--line)] p-2.5 hover:bg-[var(--sage-soft)] sm:p-4" aria-describedby={calorieDescription} aria-label={`進捗を開く。消費 ${amount(burned)} kcal。消費から摂取を引いた収支 ${differenceText} kcal。${differenceStatus}`}>
          <span className="text-[11px] font-bold sm:text-sm">消費・収支</span>
          <span className="mt-1 grid size-[76px] shrink-0 place-items-center rounded-full p-[9px] sm:size-[124px] sm:p-[12px]" style={{ background: balanceRing }}><span className="flex size-full flex-col items-center justify-center rounded-full bg-white text-center"><strong className="metric text-xs leading-none sm:text-lg" style={{ color: differenceColor }}>{differenceText}</strong><small className="mt-0.5 text-[10px] text-[var(--muted)]">収支 kcal</small></span></span>
          <span className="mt-1 text-center text-[10px] font-semibold sm:text-xs" style={{ color: differenceColor }}>{differenceStatus}</span>
          <span className="mt-0.5 w-full space-y-0.5 text-[10px] sm:text-xs"><span className="flex items-center gap-1"><span className="size-2 shrink-0 rounded-full bg-[var(--sage-deep)]" />消費<span className="metric ml-auto whitespace-nowrap">{amount(burned)} kcal</span></span><span className="flex items-center gap-1"><span className="size-2 shrink-0 rounded-full bg-[var(--coral)]" />摂取<span className="metric ml-auto whitespace-nowrap">{amount(consumed)} kcal</span></span></span>
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
