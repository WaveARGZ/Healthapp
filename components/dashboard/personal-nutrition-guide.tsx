import Link from "next/link";
import { estimateDailyCalorieGuide } from "@/lib/utils/daily-calorie-guide";
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
  const unavailableMessage = guide.status === "outside-adult-range"
    ? "この計算は20～78歳の成人向けです。"
    : guide.status === "underweight"
      ? "現在の身長・体重では、体脂肪を減らす目標の数値目安は表示しません。"
      : guide.status === "low-estimate"
        ? "推定値が低いため、数値目安は表示しません。"
        : "年齢・身長・体重を登録すると、あなた向けの目安を表示できます。";

  return <div className="mt-6 border-t border-[var(--line)] pt-4 text-sm leading-6 text-[var(--muted)]" aria-label="1日の目安の計算方法">
    {loading ? <p>目安を計算しています…</p>
      : unavailable ? <p className="text-[var(--coral)]">プロフィールを読み込めないため、目安を表示できません。</p>
        : guide.status !== "ready" || !profile ? <p>{unavailableMessage} <Link href="/onboarding" className="text-link">プロフィールを編集</Link></p>
          : <>
            <div className="flex flex-wrap gap-x-5 gap-y-1 font-semibold text-[#607960]" aria-label="基礎代謝と総消費の目安">
              <span>基礎代謝 <span className="metric">{kcalRange(guide.minRestingKcal, guide.maxRestingKcal)} kcal</span></span>
              <span>総消費 <span className="metric">{kcalRange(guide.minExpenditureKcal, guide.maxExpenditureKcal)} kcal</span></span>
            </div>
            <details>
              <summary className="inline-flex min-h-9 items-center font-semibold text-[var(--sage-deep)]">1日の目安の計算方法・内訳</summary>
              <div className="space-y-2 pb-2">
                <p>目標：{fitnessGoalLabels[profile.goal]} · {profile.heightCm}cm · {weightKg}kg · {profile.age}歳 · {genderLabels[profile.gender ?? "prefer-not-to-say"]} <Link href="/onboarding" className="ml-1 underline underline-offset-2">プロフィールを編集</Link></p>
                <p>身長・体重・年齢・性別から安静時消費を推定し、活動係数1.4～1.6を掛けた総消費から安静時消費を引いて、活動による消費の目安を表示します。日常活動・運動・食事の消化などを含み、運動だけで消費すべき量ではありません。筋トレで記録した消費カロリーとも集計範囲が異なります。摂取目安の増量＋5％・減量－10％と、目標別PFC配分はアプリ内の参考設定です。{guide.broadRange ? "性別の計算係数を指定していないため、範囲を広めに表示しています。" : ""}</p>
                <p>参考：<a className="underline" href="https://pubmed.ncbi.nlm.nih.gov/2305711/" target="_blank" rel="noopener noreferrer">安静時消費の推定式</a>、<a className="underline" href="https://www.niddk.nih.gov/bwp" target="_blank" rel="noopener noreferrer">活動量の目安</a>、<a className="underline" href="https://kennet.mhlw.go.jp/information/information/dictionary/food/ye-013" target="_blank" rel="noopener noreferrer">日本人の食事摂取基準のPFC範囲</a></p>
              </div>
            </details>
          </>}
  </div>;
}
