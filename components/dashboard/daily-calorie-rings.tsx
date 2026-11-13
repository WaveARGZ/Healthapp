import Link from "next/link";
import { burnMinusIntake } from "@/lib/utils/daily-burn";
import type { summarizeDailyMacros } from "@/lib/utils/meal-macros";

type DailyMacros = ReturnType<typeof summarizeDailyMacros>;

const outerRadius = 102;
const burnRadius = 80;
const outerCircumference = 2 * Math.PI * outerRadius;
const burnCircumference = 2 * Math.PI * burnRadius;
const macroColors = { proteinG: "#e989db", fatG: "#ffd16d", carbsG: "#aa91ff" };
const macroTextColors = { proteinG: "#a83e91", fatG: "#926510", carbsG: "#6247a8" };

function formatGrams(value: number) {
  return (Math.round(value * 10) / 10).toLocaleString("ja-JP", { maximumFractionDigits: 1 });
}

export function DailyCalorieRings({ macros, burned, consumed, calorieGoal, loading, burnLoadFailed, mealLoadFailed, incompleteMeals }: {
  macros: DailyMacros;
  burned: number | null;
  consumed: number | null;
  calorieGoal: number | null;
  loading: boolean;
  burnLoadFailed: boolean;
  mealLoadFailed: boolean;
  incompleteMeals: boolean;
}) {
  const difference = burnMinusIntake(burned, consumed);
  const calorieScale = Math.max(calorieGoal ?? 0, burned ?? 0, consumed ?? 0, 1);
  const hasCalorieScale = calorieGoal !== null || burned !== null || consumed !== null;
  const macroEnergy = macros.proteinG * 4 + macros.fatG * 9 + macros.carbsG * 4;
  const macrosReady = !loading && !mealLoadFailed;
  const gramText = (key: keyof typeof macros.knownCounts) => macrosReady && (macros.mealCount === 0 || macros.knownCounts[key] > 0)
    ? `${formatGrams(macros[key])}g` : "—";
  const macroSegments = macrosReady && macroEnergy > 0 ? [
    { fraction: (macros.proteinG * 4) / macroEnergy, color: macroColors.proteinG },
    { fraction: (macros.fatG * 9) / macroEnergy, color: macroColors.fatG },
    { fraction: (macros.carbsG * 4) / macroEnergy, color: macroColors.carbsG },
  ] : [];
  const burnedText = loading ? "読み込み中" : burnLoadFailed ? "取得不可" : burned === null ? "未入力" : `${burned.toLocaleString("ja-JP")} kcal`;
  const differenceText = difference === null ? "—" : `${difference > 0 ? "+" : ""}${difference.toLocaleString("ja-JP")}`;
  const differenceColor = difference === null || difference === 0 ? "var(--ink)" : difference > 0 ? "var(--sage-deep)" : "var(--coral)";
  const statuses = [
    loading ? "記録を読み込み中…" : null,
    !loading && mealLoadFailed ? "食事記録を読み込めませんでした。" : null,
    !loading && burnLoadFailed ? "消費カロリーを読み込めませんでした。" : null,
    macrosReady && macros.mealCount === 0 ? "食事を登録するとPFCが表示されます。" : null,
    macrosReady && macros.incompleteMeals > 0 ? "一部の食事・栄養素は未入力です。PFCの帯は入力済み分のみで計算しています。" : null,
    !loading && !burnLoadFailed && burned === null ? "消費カロリーは未入力です。" : null,
    !loading && !mealLoadFailed && consumed === null && macros.mealCount > 0 ? "カロリー未入力の食事は差の計算に含められません。" : null,
    !loading && incompleteMeals && consumed !== null ? "カロリー未入力の食事は差の計算に含まれていません。" : null,
  ].filter(Boolean);

  return <div className="mt-6 border-t border-[var(--line)] pt-5" aria-label="今日のPFCとカロリー収支">
    <h2 className="text-sm font-bold">今日の栄養とカロリー</h2>
    <div className="mt-5 flex flex-col items-center gap-6 sm:flex-row sm:justify-center sm:gap-10">
      <div className="relative aspect-square w-full max-w-[240px] shrink-0" role="img" aria-label={`今日の記録。PFC：P ${gramText("proteinG")}、F ${gramText("fatG")}、C ${gramText("carbsG")}。消費カロリー：${burnedText}。消費から摂取を引いた差：${differenceText} kcal`}>
        <svg aria-hidden="true" viewBox="0 0 240 240" className="size-full -rotate-90">
          <circle cx="120" cy="120" r="67" fill="white" />
          <circle cx="120" cy="120" r={outerRadius} fill="none" stroke="var(--sage-soft)" strokeWidth="12" />
          {macroSegments.map((segment, index) => {
            const length = segment.fraction * outerCircumference;
            const start = macroSegments.slice(0, index).reduce((sum, previous) => sum + previous.fraction * outerCircumference, 0);
            return length > 0 ? <circle key={index} cx="120" cy="120" r={outerRadius} fill="none" stroke={segment.color} strokeWidth="12" strokeDasharray={`${length} ${outerCircumference - length}`} strokeDashoffset={-start} /> : null;
          })}
          <circle cx="120" cy="120" r={burnRadius} fill="none" stroke="var(--sage-soft)" strokeWidth="12" />
          {burned !== null && <circle cx="120" cy="120" r={burnRadius} fill="none" stroke="var(--coral)" strokeWidth="12" strokeDasharray={`${Math.min(1, burned / calorieScale) * burnCircumference} ${burnCircumference}`} />}
        </svg>
        <div className="absolute inset-[29%] flex flex-col items-center justify-center text-center">
          <span className="text-[10px] font-semibold leading-4 text-[var(--muted)]">消費 − 摂取</span>
          <strong className="metric mt-1 text-[clamp(20px,3vw,28px)] font-bold leading-none" style={{ color: differenceColor }}>{differenceText}</strong>
          <span className="mt-1 text-[11px] text-[var(--muted)]">kcal</span>
        </div>
      </div>
      <div className="w-full max-w-sm min-w-0 divide-y divide-[var(--line)]">
        <div className="py-3 first:pt-0">
          <p className="text-xs font-bold">外側の帯 · PFC</p>
          <p className="metric mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm font-semibold">
            <span style={{ color: macroTextColors.proteinG }}>P {gramText("proteinG")}</span>
            <span style={{ color: macroTextColors.fatG }}>F {gramText("fatG")}</span>
            <span style={{ color: macroTextColors.carbsG }}>C {gramText("carbsG")}</span>
          </p>
        </div>
        <div className="py-3">
          <p className="text-xs font-bold">内側の帯 · 消費カロリー</p>
          <p className="metric mt-1 text-lg font-semibold text-[var(--coral)]">{burned === null ? "—" : burned.toLocaleString("ja-JP")} <span className="text-xs font-normal text-[var(--muted)]">kcal</span></p>
        </div>
        <div className="py-3 last:pb-0">
          <p className="text-xs font-bold">円の中心 · 消費 − 摂取</p>
          <p className="metric mt-1 text-lg font-semibold" style={{ color: differenceColor }}>{differenceText} <span className="text-xs font-normal text-[var(--muted)]">kcal</span></p>
          <p className="mt-0.5 text-xs text-[var(--muted)]">{difference === null ? "未計算" : difference > 0 ? "消費が多い" : difference < 0 ? "摂取が多い" : "差なし"}</p>
        </div>
      </div>
    </div>
    <p className="mt-4 text-[11px] leading-5 text-[var(--muted)]">PFCの帯はエネルギー割合。{hasCalorieScale ? `消費の帯は ${calorieScale.toLocaleString("ja-JP")} kcal を基準に表示します。` : "消費カロリーを入力すると内側の帯が表示されます。"}</p>
    {statuses.length > 0 && <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{statuses.join(" ")}</p>}
    <div className="flex flex-wrap gap-x-5">
      {macrosReady && macros.mealCount === 0 && <Link href="/meals" className="text-link">食事を記録する</Link>}
      {!loading && !burnLoadFailed && burned === null && <Link href="/workouts" className="text-link">消費カロリーを記録する</Link>}
    </div>
  </div>;
}
