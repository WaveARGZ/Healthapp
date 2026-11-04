"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FieldLabel, SelectInput, TextInput } from "@/components/ui/form-fields";
import { Icon } from "@/components/ui/icon";
import { Logo } from "@/components/ui/logo";
import { bodyMakeClient } from "@/lib/api/client";
import { createId } from "@/lib/utils/id";
import { fitnessGoalLabels, type FitnessGoal, type Gender, type UserProfile } from "@/types/user";
import { hasCloudSession } from "@/lib/auth/cognito-session";
import { isCloudConfigured, isSharedTestEnvironment, isTestEnvironment } from "@/lib/cloud/config";
import { firebaseConfig, isFirebaseConfigured, isFirebaseSelected } from "@/lib/firebase/config";
import { recommendationMode } from "@/lib/recommendations/availability";
import { isRecommendationPreferences, type RecommendationPreferences } from "@/types/recommendation-preferences";

const goals = Object.entries(fitnessGoalLabels) as Array<[FitnessGoal, string]>;
const recommendationsEnabled = recommendationMode({ test: isTestEnvironment, sharedTest: isSharedTestEnvironment,
  cloud: isCloudConfigured, firebase: isFirebaseSelected, firebaseConfigured: isFirebaseConfigured, projectId: firebaseConfig.projectId }) !== null;
const recommendationQuestions = [
  ["dietaryRestriction", "食物アレルギー・食事制限がありますか？"],
  ["pain", "運動を控えたい痛み・体調不良がありますか？"],
  ["tired", "疲労が強く、休養を優先したいですか？"],
  ["professionalGuidance", "妊娠・授乳中、治療中など専門家の配慮が必要ですか？"],
] as const;
type RecommendationAnswers = Record<typeof recommendationQuestions[number][0], "" | "yes" | "no">;

function profileErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.includes("ログインが必要")) return "ログイン状態を確認できません。Googleで再度ログインしてください。";
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  if (code === "permission-denied") return "保存先へのアクセスが許可されていません。ログイン中のGoogleアカウントを確認してください。";
  if (code === "unavailable") return "保存先に接続できません。通信状態を確認してから再度お試しください。";
  return "プロフィールを保存できませんでした。もう一度お試しください。";
}

export function OnboardingForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<Gender>("prefer-not-to-say");
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [goal, setGoal] = useState<FitnessGoal>("build-muscle");
  const [recommendationAnswers, setRecommendationAnswers] = useState<RecommendationAnswers>({ dietaryRestriction: "", pain: "", tired: "", professionalGuidance: "" });
  const [availableMinutes, setAvailableMinutes] = useState("");
  const [loadedProfile, setLoadedProfile] = useState<UserProfile | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (isCloudConfigured && !isFirebaseSelected && !hasCloudSession()) { router.replace("/login"); return; }
    void bodyMakeClient.getProfile().then((profile) => {
      if (!profile) return;
      setLoadedProfile(profile);
      setName(profile.name);
      setAge(profile.age?.toString() ?? "");
      setGender(profile.gender ?? "prefer-not-to-say");
      setHeightCm(profile.heightCm?.toString() ?? "");
      setWeightKg(profile.startingWeightKg?.toString() ?? "");
      setGoal(profile.goal);
      if (isRecommendationPreferences(profile.recommendationPreferences)) {
        const saved = profile.recommendationPreferences;
        setRecommendationAnswers({ dietaryRestriction: saved.dietaryRestriction ? "yes" : "no", pain: saved.pain ? "yes" : "no", tired: saved.tired ? "yes" : "no", professionalGuidance: saved.professionalGuidance ? "yes" : "no" });
        setAvailableMinutes(String(saved.availableMinutes));
      }
    }).catch(() => { setLoadFailed(true); setNotice("プロフィールを読み込めませんでした。通信状態とログインを確認して再読み込みしてください。"); })
      .finally(() => setIsLoading(false));
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isLoading || isSaving || loadFailed) return;
    const recommendationPreferences: RecommendationPreferences = {
      version: "1", dietaryRestriction: recommendationAnswers.dietaryRestriction === "yes",
      pain: recommendationAnswers.pain === "yes", tired: recommendationAnswers.tired === "yes",
      professionalGuidance: recommendationAnswers.professionalGuidance === "yes",
      availableMinutes: Number(availableMinutes) as RecommendationPreferences["availableMinutes"],
    };
    if (recommendationsEnabled && (Object.values(recommendationAnswers).some((value) => value !== "yes" && value !== "no") || !isRecommendationPreferences(recommendationPreferences))) {
      setNotice("おすすめに使う基本情報を選択してください。"); return;
    }
    setIsSaving(true);
    setNotice("");
    try {
      // Firebase assigns the signed-in user's ID during save. A second read here can
      // fail independently and must not prevent the write the user requested.
      const current = isFirebaseSelected ? null : await bodyMakeClient.getProfile();
      const profile: UserProfile = {
        ...(current ?? loadedProfile ?? {}),
        id: current?.id ?? loadedProfile?.id ?? createId("user"),
        name: name.trim(),
        age: age ? Number(age) : undefined,
        gender,
        heightCm: heightCm ? Number(heightCm) : undefined,
        startingWeightKg: weightKg ? Number(weightKg) : undefined,
        goal,
        ...(recommendationsEnabled ? { recommendationPreferences } : {}),
        updatedAt: new Date().toISOString(),
      };
      await bodyMakeClient.saveProfile(profile);
      router.replace("/dashboard");
    } catch (error) {
      setNotice(profileErrorMessage(error));
      setIsSaving(false);
    }
  }

  return (
    <main className="setup-page">
      <div className="setup-content pb-8"><Logo /><header className="setup-heading"><p className="setup-step">プロフィール・目標の設定</p><h1 className="setup-title">いまの身体と、目標。</h1><p className="mt-3 text-sm leading-6 text-[var(--muted)]">現在の身体情報を入力してください。あとから設定で変更できます。</p></header>
        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div><FieldLabel htmlFor="profile-name">名前</FieldLabel><TextInput id="profile-name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="例：山田 太郎" required /></div>
          <div className="grid grid-cols-2 gap-3"><div><FieldLabel htmlFor="age">年齢</FieldLabel><TextInput id="age" type="number" min="1" max="120" inputMode="numeric" value={age} onChange={(event) => setAge(event.target.value)} placeholder="例：28" /></div><div><FieldLabel htmlFor="gender">性別</FieldLabel><SelectInput id="gender" value={gender} onChange={(event) => setGender(event.target.value as Gender)}><option value="prefer-not-to-say">回答しない</option><option value="male">男性</option><option value="female">女性</option><option value="other">その他</option></SelectInput></div></div>
          <div className="grid grid-cols-2 gap-3"><div><FieldLabel htmlFor="height">身長 (cm)</FieldLabel><TextInput id="height" type="number" min="50" max="250" inputMode="decimal" value={heightCm} onChange={(event) => setHeightCm(event.target.value)} placeholder="例：170" /></div><div><FieldLabel htmlFor="weight">体重 (kg)</FieldLabel><TextInput id="weight" type="number" min="20" max="400" step="0.1" inputMode="decimal" value={weightKg} onChange={(event) => setWeightKg(event.target.value)} placeholder="例：62.5" /></div></div>
          <p className="text-xs leading-5 text-[var(--muted)]">ホームの摂取カロリー目安には年齢・身長・体重を使います。性別を回答しない場合も、幅を広げた目安を表示できます。</p>
          <fieldset><legend className="mb-2 block text-xs font-bold tracking-[0.03em] text-[var(--ink)]">目標</legend><div className="space-y-2">{goals.map(([value, label]) => <label key={value} className={`flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded border p-4 transition focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--sage-deep)] ${goal === value ? "border-[var(--sage-deep)] bg-[var(--sage-soft)]" : "border-[var(--line)] bg-white"}`}><span className="min-w-0 text-sm font-semibold leading-6 text-[var(--ink)]">{label}</span><input className="sr-only" type="radio" name="goal" value={value} checked={goal === value} onChange={() => setGoal(value)} /><span className={`grid size-5 shrink-0 place-items-center rounded-full border ${goal === value ? "border-[var(--sage-deep)] bg-[var(--sage-deep)] text-white" : "border-[#cdd3cf]"}`}>{goal === value ? <Icon name="check" className="size-3.5" /> : null}</span></label>)}</div></fieldset>
          {recommendationsEnabled && <fieldset className="space-y-4 border-t border-[var(--line)] pt-5" disabled={isLoading || isSaving || loadFailed}>
            <legend className="px-1 text-sm font-bold">おすすめに使う基本情報</legend>
            <p className="text-xs leading-6 text-[var(--muted)]">初回に設定し、変更があったときだけ「設定 → プロフィール」から更新してください。保存した内容を次回以降のおすすめにも使います。</p>
            {recommendationQuestions.map(([key, label]) => <div key={key}>
              <FieldLabel htmlFor={`recommendation-${key}`}>{label}</FieldLabel>
              <SelectInput id={`recommendation-${key}`} value={recommendationAnswers[key]} required onChange={(event) => setRecommendationAnswers((previous) => ({ ...previous, [key]: event.target.value as RecommendationAnswers[typeof key] }))}>
                <option value="" disabled>選択してください</option><option value="no">いいえ</option><option value="yes">はい</option>
              </SelectInput>
            </div>)}
            <div><FieldLabel htmlFor="recommendation-minutes">普段、筋トレに使える時間</FieldLabel><SelectInput id="recommendation-minutes" value={availableMinutes} required onChange={(event) => setAvailableMinutes(event.target.value)}><option value="" disabled>選択してください</option>{[10, 20, 30, 45, 60].map((minutes) => <option key={minutes} value={minutes}>{minutes}分</option>)}</SelectInput></div>
            <p className="text-xs leading-6 text-[var(--muted)]">配慮が必要な項目に応じて、食事・運動の提案を控えます。ここでの保存は、API送信やAI学習への同意にはなりません。</p>
          </fieldset>}
          <Button type="submit" className="mt-3 w-full" disabled={isLoading || isSaving || loadFailed}>{isLoading ? "読み込み中..." : isSaving ? "保存中..." : "保存してホームへ"}</Button>
          {notice && <p role="alert" className="break-words rounded-md bg-[var(--coral-soft)] p-3 text-sm leading-6 text-[var(--coral)]">{notice}</p>}
        </form>
      </div>
    </main>
  );
}
