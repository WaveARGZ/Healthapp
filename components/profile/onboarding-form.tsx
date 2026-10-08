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
import { isCloudConfigured } from "@/lib/cloud/config";

const goals = Object.entries(fitnessGoalLabels) as Array<[FitnessGoal, string]>;

export function OnboardingForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<Gender>("prefer-not-to-say");
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [goal, setGoal] = useState<FitnessGoal>("build-muscle");
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (isCloudConfigured && !hasCloudSession()) { router.replace("/login"); return; }
    void bodyMakeClient.getProfile().then((profile) => {
      if (!profile) return;
      setName(profile.name);
      setAge(profile.age?.toString() ?? "");
      setGender(profile.gender ?? "prefer-not-to-say");
      setHeightCm(profile.heightCm?.toString() ?? "");
      setWeightKg(profile.startingWeightKg?.toString() ?? "");
      setGoal(profile.goal);
    }).catch(() => setNotice("プロフィールを読み込めませんでした。再度ログインしてください。"));
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setNotice("");
    try {
      const current = await bodyMakeClient.getProfile();
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
      const fromSignup = new URLSearchParams(window.location.search).get("from") === "signup";
      router.push(fromSignup || !current ? "/onboarding/photos" : "/dashboard");
    } catch {
      setNotice("プロフィールを保存できませんでした。もう一度お試しください。");
      setIsSaving(false);
    }
  }

  return (
    <main className="setup-page">
      <div className="setup-content pb-8"><Logo /><header className="setup-heading"><p className="setup-step">プロフィール・目標の設定</p><h1 className="setup-title">いまの身体と、目標。</h1><p className="mt-3 text-sm leading-6 text-[var(--muted)]">現在の身体情報を入力してください。あとから設定で変更できます。</p></header>
        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div><FieldLabel htmlFor="profile-name">名前</FieldLabel><TextInput id="profile-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="例：山田 太郎" required /></div>
          <div className="grid grid-cols-2 gap-3"><div><FieldLabel htmlFor="age">年齢</FieldLabel><TextInput id="age" type="number" min="1" max="120" inputMode="numeric" value={age} onChange={(event) => setAge(event.target.value)} placeholder="例：28" /></div><div><FieldLabel htmlFor="gender">性別</FieldLabel><SelectInput id="gender" value={gender} onChange={(event) => setGender(event.target.value as Gender)}><option value="prefer-not-to-say">回答しない</option><option value="male">男性</option><option value="female">女性</option><option value="other">その他</option></SelectInput></div></div>
          <div className="grid grid-cols-2 gap-3"><div><FieldLabel htmlFor="height">身長 (cm)</FieldLabel><TextInput id="height" type="number" min="50" max="250" inputMode="decimal" value={heightCm} onChange={(event) => setHeightCm(event.target.value)} placeholder="例：170" /></div><div><FieldLabel htmlFor="weight">体重 (kg)</FieldLabel><TextInput id="weight" type="number" min="20" max="400" step="0.1" inputMode="decimal" value={weightKg} onChange={(event) => setWeightKg(event.target.value)} placeholder="例：62.5" /></div></div>
          <fieldset><legend className="mb-2 block text-xs font-bold tracking-[0.03em] text-[var(--ink)]">目標</legend><div className="space-y-2">{goals.map(([value, label]) => <label key={value} className={`flex cursor-pointer items-center justify-between rounded border p-4 transition focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--sage-deep)] ${goal === value ? "border-[var(--sage-deep)] bg-[var(--sage-soft)]" : "border-[var(--line)] bg-white"}`}><span className="text-sm font-semibold text-[var(--ink)]">{label}</span><input className="sr-only" type="radio" name="goal" value={value} checked={goal === value} onChange={() => setGoal(value)} /><span className={`grid size-5 place-items-center rounded-full border ${goal === value ? "border-[var(--sage-deep)] bg-[var(--sage-deep)] text-white" : "border-[#cdd3cf]"}`}>{goal === value ? <Icon name="check" className="size-3.5" /> : null}</span></label>)}</div></fieldset>
          <Button type="submit" className="mt-3 w-full" disabled={isSaving}>{isSaving ? "保存中..." : "保存して次へ"}</Button>
          {notice && <p role="alert" className="text-center text-xs text-[#ad5a50]">{notice}</p>}
        </form>
      </div>
    </main>
  );
}
