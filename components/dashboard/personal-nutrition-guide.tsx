import Link from "next/link";
import { estimateDailyCalorieGuide, estimateDailyMacroGuide } from "@/lib/utils/daily-calorie-guide";
import { fitnessGoalLabels, type UserProfile } from "@/types/user";

const genderLabels = { male: "男性", female: "女性", other: "その他", "prefer-not-to-say": "性別は回答しない" } as const;

function kcalRange(min: number, max: number) {
  return min === max ? min.toLocaleString("ja-JP") : `${min.toLocaleString("ja-JP")}～${max.toLocaleString("ja-JP")}`;
}

export function PersonalNutritionGuide({ profile, weightKg, loading, unavailable }: {
  profile: UserProfile | null;
  weightKg: number | null;
  loading: boolean;
  unavailable: boolean;
}) {
  const guide = profile ? estimateDailyCalorieGuide({
    age: profile.age,
    gender: profile.gender,
    heightCm: profile.heightCm,
    weightKg: weightKg ?? undefined,
    goal: profile.goal,
  }) : { status: "missing-profile" as const };
  const macros = guide.status === "ready" && profile ? estimateDailyMacroGuide(guide, profile.goal) : null;
  const unavailableMessage = guide.status === "outside-adult-range"
    ? "この計算は20～78歳の成人向けです。"
    : guide.status === "underweight"
      ? "現在の身長・体重では、体脂肪を減らす目標の数値目安は表示しません。"
      : guide.status === "low-estimate"
        ? "推定値が低いため、数値目安は表示しません。"
        : "年齢・身長・体重を登録すると、あなた向けの目安を表示できます。";

  return <div className="mt-8 border-t border-[var(--line)] pt-7 sm:mt-10 sm:pt-9" aria-label="目標に合わせた1日の栄養目安">
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-lg font-bold tracking-[-.03em] text-[var(--ink)] sm:text-xl">あなたの1日の目安</h3>
      <Link href="/onboarding" className="text-link min-h-9 shrink-0 text-xs">プロフィールを編集</Link>
    </div>
    {loading ? <p className="mt-2 text-xs text-[var(--muted)]">目安を計算しています…</p>
      : unavailable ? <p className="mt-2 text-xs text-[var(--coral)]">プロフィールを読み込めないため、目安を表示できません。</p>
        : guide.status !== "ready" || !profile || !macros ? <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{unavailableMessage}</p>
          : <>
            <p className="mt-1 text-xs font-semibold text-[var(--sage-deep)]">{fitnessGoalLabels[profile.goal]}</p>
            <p className="mt-0.5 text-[11px] leading-5 text-[var(--muted)] sm:text-xs">{profile.heightCm}cm · {weightKg}kg · {profile.age}歳 · {genderLabels[profile.gender ?? "prefer-not-to-say"]}</p>
            <div className="mt-5 grid grid-cols-[1.1fr_.9fr] gap-3 sm:gap-4">
              <div className="rounded-lg border border-[var(--line)] bg-[var(--canvas)] p-4 sm:p-6">
                <p className="text-[11px] font-semibold text-[var(--ink-soft)] sm:text-xs">摂取カロリーの目安</p>
                <p className="metric mt-1 text-[16px] font-bold leading-snug text-[var(--sage-deep)] sm:text-xl">{kcalRange(guide.minKcal, guide.maxKcal)}</p>
                <p className="text-[10px] text-[var(--muted)]">kcal / 日</p>
              </div>
              <div className="rounded-lg border border-[var(--line)] bg-white p-4 sm:p-6">
                <p className="text-[11px] font-semibold text-[var(--ink-soft)] sm:text-xs">総消費カロリーの推定</p>
                <p className="metric mt-1 text-[16px] font-bold leading-snug text-[var(--ink)] sm:text-xl">{kcalRange(guide.minExpenditureKcal, guide.maxExpenditureKcal)}</p>
                <p className="text-[10px] text-[var(--muted)]">kcal / 日</p>
              </div>
            </div>
            <div className="mt-4 rounded-lg border border-[var(--line)] p-4 sm:p-6">
              <h4 className="text-sm font-bold text-[var(--ink)]">PFCバランスの目安</h4>
              <div className="mt-3 divide-y divide-[var(--line)]">
                {([
                  ["P", "たんぱく質", macros.protein],
                  ["F", "脂質", macros.fat],
                  ["C", "炭水化物", macros.carbs],
                ] as const).map(([initial, label, macro]) => <div key={initial} className="flex min-w-0 items-baseline justify-between gap-2 py-3 first:pt-0 last:pb-0">
                  <p className="text-xs text-[var(--muted)]"><strong className="mr-2 text-sm text-[var(--sage-deep)]">{initial}</strong>{label}</p>
                  <p className="metric whitespace-nowrap text-sm font-bold text-[var(--ink)]">{kcalRange(macro.minG, macro.maxG)}g <span className="ml-1 text-[11px] font-normal text-[var(--muted)]">{macro.percent}%</span></p>
                </div>)}
              </div>
            </div>
            <p className="mt-2 text-[11px] leading-5 text-[var(--muted)]">総消費は安静時・日常活動・運動を含む1日全体の推定です。筋トレで記録した消費カロリーとは別の数値です。{guide.broadRange ? "男性・女性の計算係数を指定していないため、範囲を広めに表示しています。" : ""}</p>
            <details className="mt-1 text-[11px] leading-5 text-[var(--muted)]">
              <summary className="inline-flex min-h-9 items-center text-[var(--sage-deep)]">計算方法と出典</summary>
              <p>身長・体重・年齢・性別から安静時消費を推定し、活動量が少なめ～軽めの範囲で総消費を計算します。摂取目安の増量＋5％・減量－10％と、目標別PFC配分はアプリ内の参考設定です。成人の一般的な目安で、活動量や体調によって変わります。</p>
              <p className="mt-1">参考：<a className="underline" href="https://pubmed.ncbi.nlm.nih.gov/2305711/" target="_blank" rel="noopener noreferrer">安静時消費の推定式</a>、<a className="underline" href="https://www.niddk.nih.gov/bwp" target="_blank" rel="noopener noreferrer">活動量の目安</a>、<a className="underline" href="https://kennet.mhlw.go.jp/information/information/dictionary/food/ye-013" target="_blank" rel="noopener noreferrer">日本人の食事摂取基準のPFC範囲</a></p>
            </details>
          </>}
  </div>;
}
