import Link from "next/link";
import type { ReactNode } from "react";
import { burnMinusIntake } from "@/lib/utils/daily-burn";
import type { summarizeDailyMacros } from "@/lib/utils/meal-macros";

type DailyMacros = ReturnType<typeof summarizeDailyMacros>;
type RingSegment = { fraction: number; color: string };

const radius = 44;
const circumference = 2 * Math.PI * radius;
const macroColors = { proteinG: "#2f7f64", fatG: "#d79037", carbsG: "#547bb3" };

function formatGrams(value: number) {
  return (Math.round(value * 10) / 10).toLocaleString("ja-JP", { maximumFractionDigits: 1 });
}

function RingCard({ title, label, value, unit, segments, children }: {
  title: string;
  label: string;
  value: string;
  unit: string;
  segments: RingSegment[];
  children: ReactNode;
}) {
  return <article className="flex min-w-0 flex-col items-center rounded-xl border border-[var(--line)] bg-[var(--sand)] px-1.5 py-3 text-center sm:px-3 sm:py-4">
    <h3 className="flex min-h-9 items-center justify-center text-[11px] font-bold leading-4 text-[var(--ink)] sm:text-sm">{title}</h3>
    <div className="relative mt-2 aspect-square w-full max-w-[140px]" role="img" aria-label={label}>
      <svg viewBox="0 0 112 112" aria-hidden="true" className="size-full -rotate-90">
        <circle cx="56" cy="56" r="36" fill="white" />
        <circle cx="56" cy="56" r={radius} fill="none" stroke="var(--sage-soft)" strokeWidth="10" />
        {segments.map((segment, index) => {
          const length = Math.min(1, Math.max(0, segment.fraction)) * circumference;
          const start = segments.slice(0, index).reduce((sum, previous) => sum + Math.min(1, Math.max(0, previous.fraction)) * circumference, 0);
          return length > 0 ? <circle key={index} cx="56" cy="56" r={radius} fill="none" stroke={segment.color} strokeWidth="10" strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-start} /> : null;
        })}
      </svg>
      <div className="absolute inset-[15%] flex flex-col items-center justify-center">
        <strong className="metric max-w-full text-[clamp(11px,1.6vw,20px)] font-bold leading-none text-[var(--ink)]">{value}</strong>
        <span className="mt-0.5 text-[10px] leading-none text-[var(--muted)]">{unit}</span>
      </div>
    </div>
    <div className="mt-2 flex min-h-8 w-full flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-[10px] leading-4 text-[var(--muted)] sm:text-xs">{children}</div>
  </article>;
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
  const hasKnownMacro = Object.values(macros.knownCounts).some((count) => count > 0);
  const macroValue = !macrosReady || (macros.mealCount > 0 && !hasKnownMacro)
    ? "—" : formatGrams(macros.proteinG + macros.fatG + macros.carbsG);
  const gramText = (key: keyof typeof macros.knownCounts) => macrosReady && (macros.mealCount === 0 || macros.knownCounts[key] > 0)
    ? `${formatGrams(macros[key])}g` : "—";
  const macroSegments = macrosReady && macroEnergy > 0 ? [
    { fraction: (macros.proteinG * 4) / macroEnergy, color: macroColors.proteinG },
    { fraction: (macros.fatG * 9) / macroEnergy, color: macroColors.fatG },
    { fraction: (macros.carbsG * 4) / macroEnergy, color: macroColors.carbsG },
  ] : [];
  const differenceText = difference === null ? "—" : `${difference > 0 ? "+" : ""}${difference.toLocaleString("ja-JP")}`;
  const differenceColor = difference === null || difference === 0 ? "var(--muted)" : difference > 0 ? "var(--sage-deep)" : "var(--coral)";
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
    <div className="mt-4 grid grid-cols-3 gap-1.5 sm:gap-3">
      <RingCard title="PFC" label={`今日のPFC：P ${gramText("proteinG")}, F ${gramText("fatG")}, C ${gramText("carbsG")}`} value={macroValue} unit="g 合計" segments={macroSegments}>
        <span style={{ color: macroColors.proteinG }}>P {gramText("proteinG")}</span>
        <span style={{ color: macroColors.fatG }}>F {gramText("fatG")}</span>
        <span style={{ color: macroColors.carbsG }}>C {gramText("carbsG")}</span>
      </RingCard>
      <RingCard title="消費カロリー" label={`今日の消費カロリー：${loading ? "読み込み中" : burnLoadFailed ? "取得不可" : burned === null ? "未入力" : `${burned.toLocaleString("ja-JP")} kcal`}`} value={burned === null ? "—" : burned.toLocaleString("ja-JP")} unit="kcal" segments={burned === null ? [] : [{ fraction: burned / calorieScale, color: "var(--coral)" }]}>
        <span>今日の総消費量</span>
      </RingCard>
      <RingCard title="消費 − 摂取" label={`消費カロリーから摂取カロリーを引いた差：${differenceText} kcal`} value={differenceText} unit="kcal" segments={difference === null ? [] : [{ fraction: Math.abs(difference) / calorieScale, color: differenceColor }]}>
        <span>{difference === null ? "未計算" : difference > 0 ? "消費が多い" : difference < 0 ? "摂取が多い" : "差なし"}</span>
      </RingCard>
    </div>
    <p className="mt-3 text-[11px] leading-5 text-[var(--muted)]">PFCの帯はエネルギー割合。{hasCalorieScale ? `カロリーの帯は共通の ${calorieScale.toLocaleString("ja-JP")} kcal を基準に表示します。` : "カロリーを入力すると、消費量と差が帯に表示されます。"}</p>
    {statuses.length > 0 && <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{statuses.join(" ")}</p>}
    <div className="flex flex-wrap gap-x-5">
      {macrosReady && macros.mealCount === 0 && <Link href="/meals" className="text-link">食事を記録する</Link>}
      {!loading && !burnLoadFailed && burned === null && <Link href="/workouts" className="text-link">消費カロリーを記録する</Link>}
    </div>
  </div>;
}
