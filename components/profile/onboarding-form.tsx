"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FieldLabel, SelectInput, TextInput } from "@/components/ui/form-fields";
import { Logo } from "@/components/ui/logo";
import { bodyMakeClient } from "@/lib/api/client";
import { createId } from "@/lib/utils/id";
import { fitnessGoalLabels, type FitnessGoal, type Gender, type UserProfile } from "@/types/user";
import { hasCloudSession } from "@/lib/auth/cognito-session";
import { isCloudConfigured } from "@/lib/cloud/config";
import { isFirebaseSelected } from "@/lib/firebase/config";

const goals = Object.entries(fitnessGoalLabels) as Array<[FitnessGoal, string]>;

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
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (isCloudConfigured && !isFirebaseSelected && !hasCloudSession()) { router.replace("/login"); return; }
    void bodyMakeClient.getProfile().then((profile) => {
      if (!profile) return;
      setName(profile.name);
      setAge(profile.age?.toString() ?? "");
      setGender(profile.gender ?? "prefer-not-to-say");
      setHeightCm(profile.heightCm?.toString() ?? "");
      setWeightKg(profile.startingWeightKg?.toString() ?? "");
      setGoal(profile.goal);
    }).catch(() => setNotice("プロフィールを読み込めませんでした。通信状態とログインを確認してください。"))
      .finally(() => setIsLoading(false));
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setNotice("");
    try {
      // Firebase assigns the signed-in user's ID during save. A second read here can
      // fail independently and must not prevent the write the user requested.
      const current = isFirebaseSelected ? null : await bodyMakeClient.getProfile();
      const profile: UserProfile = {
        id: current?.id ?? createId("user"),
        name: name.trim(),
        age: age ? Number(age) : undefined,
        gender,
        heightCm: heightCm ? Number(heightCm) : undefined,
        startingWeightKg: weightKg ? Number(weightKg) : undefined,
        goal,
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
      <div className="setup-content pb-8">
        <Logo />
        <header className="setup-heading">
          <h1 className="setup-title">プロフィール設定</h1>
          <p className="mt-3 text-sm leading-7 text-[var(--muted)]">あとから変更できます。</p>
        </header>
        <form onSubmit={handleSubmit} className="mt-7 space-y-5">
          <section className="panel space-y-6" aria-labelledby="profile-goals-title">
            <h2 id="profile-goals-title" className="section-title">名前と目標</h2>
            <div>
              <FieldLabel htmlFor="profile-name">名前（必須）</FieldLabel>
              <TextInput id="profile-name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="例：山田 太郎" required />
            </div>
            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-[var(--ink-soft)]">身体づくりの目標</legend>
              <div className="space-y-2">
                {goals.map(([value, label]) => (
                  <label key={value} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--sage-deep)] ${goal === value ? "border-[var(--sage-deep)] bg-[var(--sage-soft)]" : "border-[var(--line)] hover:bg-[var(--canvas)]"}`}>
                    <input type="radio" name="goal" value={value} checked={goal === value} onChange={() => setGoal(value)} className="size-4 shrink-0 accent-[var(--sage-deep)]" />
                    <span className="text-sm font-semibold text-[var(--ink)]">{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </section>
          <section className="panel space-y-5" aria-labelledby="body-details-title">
            <div>
              <h2 id="body-details-title" className="section-title">身体情報 <span className="ml-1 text-sm font-medium text-[var(--muted)]">任意</span></h2>
              <p className="mt-2 text-sm leading-7 text-[var(--muted)]">カロリー目安の計算に使います。性別は回答しなくても利用できます。</p>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-5">
              <div><FieldLabel htmlFor="age">年齢</FieldLabel><TextInput id="age" type="number" min="1" max="120" inputMode="numeric" value={age} onChange={(event) => setAge(event.target.value)} placeholder="例：28" /></div>
              <div><FieldLabel htmlFor="gender">性別</FieldLabel><SelectInput id="gender" value={gender} onChange={(event) => setGender(event.target.value as Gender)}><option value="prefer-not-to-say">回答しない</option><option value="male">男性</option><option value="female">女性</option><option value="other">その他</option></SelectInput></div>
              <div><FieldLabel htmlFor="height">身長 (cm)</FieldLabel><TextInput id="height" type="number" min="50" max="250" inputMode="decimal" value={heightCm} onChange={(event) => setHeightCm(event.target.value)} placeholder="例：170" /></div>
              <div><FieldLabel htmlFor="weight">体重 (kg)</FieldLabel><TextInput id="weight" type="number" min="20" max="400" step="0.1" inputMode="decimal" value={weightKg} onChange={(event) => setWeightKg(event.target.value)} placeholder="例：62.5" /></div>
            </div>
          </section>
          {notice && <p role="alert" className="break-words rounded-md bg-[var(--coral-soft)] p-3 text-sm leading-6 text-[var(--coral)]">{notice}</p>}
          <Button type="submit" className="w-full" disabled={isLoading || isSaving}>{isLoading ? "読み込み中..." : isSaving ? "保存中..." : "保存してホームへ"}</Button>
        </form>
      </div>
    </main>
  );
}
