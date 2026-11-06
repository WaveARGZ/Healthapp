import Link from "next/link";
import type { summarizeDailyMacros } from "@/lib/utils/meal-macros";

type DailyMacros = ReturnType<typeof summarizeDailyMacros>;

const ringRadius = 77;
const circumference = 2 * Math.PI * ringRadius;
const macroColors = { proteinG: "#2f7f64", fatG: "#d79037", carbsG: "#547bb3" };

function formatGrams(value: number) {
  return (Math.round(value * 10) / 10).toLocaleString("ja-JP", { maximumFractionDigits: 1 });
}

export function DailyPfcRing({ macros, loading, unavailable }: { macros: DailyMacros; loading: boolean; unavailable: boolean }) {
  const nutrients = [
    { key: "proteinG", short: "P", name: "たんぱく質", grams: macros.proteinG, kcal: macros.proteinG * 4, color: macroColors.proteinG },
    { key: "fatG", short: "F", name: "脂質", grams: macros.fatG, kcal: macros.fatG * 9, color: macroColors.fatG },
    { key: "carbsG", short: "C", name: "炭水化物", grams: macros.carbsG, kcal: macros.carbsG * 4, color: macroColors.carbsG },
  ] as const;
  const energyTotal = nutrients.reduce((sum, nutrient) => sum + nutrient.kcal, 0);
  let offset = 0;
  const segments = nutrients.map((nutrient) => {
    const length = energyTotal > 0 ? (nutrient.kcal / energyTotal) * circumference : 0;
    const segment = { ...nutrient, length, offset };
    offset += length;
    return segment;
  });
  const totalGrams = macros.proteinG + macros.fatG + macros.carbsG;
  const ready = !loading && !unavailable;
  const hasKnownMacro = Object.values(macros.knownCounts).some((count) => count > 0);
  const centerText = !ready || (macros.mealCount > 0 && !hasKnownMacro) ? "—" : `${formatGrams(totalGrams)}g`;
  const displayedGrams = (key: keyof typeof macros.knownCounts, grams: number) => ready && (macros.mealCount === 0 || macros.knownCounts[key] > 0) ? `${formatGrams(grams)}g` : "—";
  const description = loading ? "食事記録を読み込み中…"
    : unavailable ? "食事記録を読み込めませんでした。"
    : macros.mealCount === 0 ? "食事を登録するとPFCが表示されます。"
    : macros.incompleteMeals > 0 ? "一部の食事・栄養素は未入力です。表示値と帯は入力済み分のみで計算しています。"
    : "外側の帯はP・F・Cのエネルギー割合です。";

  return <div className="mt-6 border-t border-[var(--line)] pt-5" aria-label="今日のPFC">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="text-sm font-bold">今日のPFC</h3>
      <span className="text-xs text-[var(--muted)]">食事記録の合計</span>
    </div>
    <div className="mt-5 flex flex-col items-center gap-5 sm:flex-row sm:justify-center sm:gap-9">
      <div role="img" aria-label={ready ? `今日のPFC：たんぱく質${displayedGrams("proteinG", macros.proteinG)}、脂質${displayedGrams("fatG", macros.fatG)}、炭水化物${displayedGrams("carbsG", macros.carbsG)}` : "今日のPFC：読み込み中または取得できません"} className="relative size-48 shrink-0">
        <svg aria-hidden="true" viewBox="0 0 192 192" className="size-full -rotate-90">
          <circle cx="96" cy="96" r="64" fill="var(--sand)" />
          <circle cx="96" cy="96" r={ringRadius} fill="none" stroke="var(--sage-soft)" strokeWidth="16" />
          {ready && energyTotal > 0 && segments.filter((segment) => segment.length > 0).map((segment) => <circle key={segment.key} cx="96" cy="96" r={ringRadius} fill="none" stroke={segment.color} strokeWidth="16" strokeDasharray={`${segment.length} ${circumference - segment.length}`} strokeDashoffset={-segment.offset} />)}
        </svg>
        <div className="absolute inset-5 flex flex-col items-center justify-center text-center">
          <span className="text-[11px] font-semibold tracking-wider text-[var(--muted)]">PFC 合計</span>
          <strong className="metric mt-1 text-[26px] leading-none text-[var(--ink)]">{centerText}</strong>
          <span className="mt-2 text-[11px] text-[var(--muted)]">{ready && macros.mealCount === 0 ? "記録なし" : "今日の摂取量"}</span>
        </div>
      </div>
      <div className="grid w-full max-w-xs grid-cols-3 gap-2 sm:max-w-56 sm:grid-cols-1 sm:gap-3">
        {nutrients.map((nutrient) => <div key={nutrient.key} className="min-w-0 rounded-lg bg-[var(--sand)] p-2.5 sm:flex sm:items-center sm:gap-3 sm:px-3">
          <span className="flex items-center gap-1.5 text-xs font-bold" style={{ color: nutrient.color }}><span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: nutrient.color }} />{nutrient.short}</span>
          <div className="mt-1 min-w-0 sm:mt-0"><span className="block text-[10px] text-[var(--muted)]">{nutrient.name}</span><span className="metric block text-base font-semibold leading-6 text-[var(--ink)]">{displayedGrams(nutrient.key, nutrient.grams)}</span></div>
        </div>)}
      </div>
    </div>
    <p className="mt-4 text-xs leading-5 text-[var(--muted)]">{description}</p>
    {ready && macros.mealCount === 0 && <Link href="/meals" className="text-link mt-1">食事を記録する</Link>}
  </div>;
}
