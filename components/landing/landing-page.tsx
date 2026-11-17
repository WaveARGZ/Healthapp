"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Icon, type IconName } from "@/components/ui/icon";
import { Logo } from "@/components/ui/logo";
import { hasDemoSession } from "@/lib/auth/demo-session";
import { hasCloudSession } from "@/lib/auth/cognito-session";
import { isCloudConfigured, isSharedTestEnvironment } from "@/lib/cloud/config";
import { isFirebaseConfigured, isFirebaseSelected } from "@/lib/firebase/config";
import { watchFirebaseUser } from "@/lib/auth/firebase-session";

const features: Array<{ number: string; icon: IconName; title: string; text: string }> = [
  { number: "01", icon: "dumbbell", title: "トレーニングを残す", text: "種目を選んで、重さと回数をセットごとに。前回の記録も振り返れます。" },
  { number: "02", icon: "leaf", title: "食べたものを知る", text: "料理名で検索、または写真から。食事ごとのカロリーと栄養を記録します。" },
  { number: "03", icon: "camera", title: "身体の変化を見る", text: "体重と、正面・背面の写真。同じ条件で残すと、小さな変化がわかります。" },
];

export function LandingPage() {
  const router = useRouter();
  useEffect(() => {
    if (isFirebaseSelected) {
      if (isFirebaseConfigured) return watchFirebaseUser((user) => { if (user) router.replace("/dashboard"); });
      return;
    }
    if (isCloudConfigured ? hasCloudSession() : hasDemoSession()) router.replace("/dashboard");
  }, [router]);

  return <main className="min-h-dvh bg-[var(--canvas)]">
    <header className="safe-top border-b border-[var(--line)] bg-white">
      <div className="mx-auto flex min-h-20 max-w-6xl items-center justify-between gap-3 safe-gutters">
        <Logo /><Link href="/login" className="text-link shrink-0 text-[var(--ink)]">ログイン<Icon name="arrow-right" className="size-4" /></Link>
      </div>
    </header>
    <section className="safe-gutters mx-auto max-w-6xl pt-10 sm:pt-20">
    <div className="grid gap-12 border-b border-[var(--line)] pb-14 sm:gap-16 sm:pb-24 lg:grid-cols-[1.15fr_.85fr] lg:items-end">
      <div className="min-w-0 pb-2">
        <p className="mb-7 text-[11px] font-bold tracking-[.2em] text-[var(--sage-deep)]">BODYMAKE / A BETTER PRACTICE</p>
        <h1 className="max-w-[13ch] text-[clamp(2.8rem,7vw,5.8rem)] font-bold leading-[1.1] tracking-[-0.065em] text-[var(--ink)]">理想の身体を、<br />見える目標に。</h1>
        <p className="mt-8 max-w-md text-[15px] leading-8 text-[var(--muted)]">食事・筋トレ・体重・身体写真。毎日の記録をまとめて、変化を振り返れます。</p>
        <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3"><Link href="/signup" className="inline-flex min-h-14 items-center justify-center gap-3 rounded-md border border-[var(--ink)] bg-[var(--ink)] px-7 text-sm font-semibold text-white transition-[background-color,border-color] hover:border-[var(--ink-soft)] hover:bg-[var(--ink-soft)]">はじめる<Icon name="arrow-right" className="size-4" /></Link><Link href="/food-photo" className="inline-flex min-h-12 items-center gap-2 border-b border-[var(--line)] text-sm font-semibold text-[var(--ink)] transition-colors hover:border-[var(--sage-deep)]">食事写真AIを無料で試す<Icon name="arrow-right" className="size-4" /></Link></div>
        <p className="mt-5 max-w-sm text-xs leading-6 text-[var(--muted)]">{isSharedTestEnvironment ? "写真の解析はログイン不要。テスト環境では学習共有を行いません。" : "写真の解析はログイン不要。正解の共有は任意です。"}</p>
      </div>
      <div className="relative min-w-0 rounded-xl border border-[var(--line)] bg-white p-6 text-[var(--ink)] sm:p-9">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-[var(--line)] pb-6"><p className="text-lg font-bold tracking-tight">わたしの記録</p><span className="text-[11px] tracking-wide text-[var(--muted)]">PREVIEW / 01</span></div>
        <div className="flex items-end justify-between border-b border-[var(--line)] py-8"><div><p className="text-xs text-[var(--muted)]">今日の体重</p><p className="metric mt-2 text-6xl font-medium">62.5<span className="ml-2 text-sm text-[var(--muted)]">kg</span></p></div><Icon name="scale" className="mb-1 size-6 text-[var(--sage-deep)]" /></div>
        {[
          { icon: "dumbbell" as const, title: "筋トレ", value: "ベンチプレス", detail: "60 kg × 10回 × 3セット" },
          { icon: "leaf" as const, title: "食事", value: "ご飯・焼き鮭・味噌汁", detail: "朝食を記録" },
          { icon: "camera" as const, title: "身体写真", value: "正面と背面", detail: "変化を写真で確認" },
        ].map((item) => <div key={item.title} className="flex items-start gap-3 border-b border-[var(--line)] py-5 last:border-b-0 sm:gap-4"><Icon name={item.icon} className="mt-1 size-5 shrink-0 text-[var(--sage-deep)]" /><div className="min-w-0 flex-1"><p className="text-xs text-[var(--muted)]">{item.title}</p><p className="mt-1 text-sm font-semibold leading-6">{item.value}</p><p className="mt-1 text-xs leading-5 text-[var(--muted)]">{item.detail}</p></div><Icon name="check" className="mt-5 size-4 shrink-0 text-[var(--sage-deep)]" /></div>)}
      </div>
    </div></section>
    <section>
      <div className="mx-auto max-w-6xl safe-gutters py-16 sm:py-24">
        <p className="text-[11px] font-bold tracking-[.18em] text-[var(--sage-deep)]">A SIMPLE ROUTINE</p>
        <h2 className="mt-3 text-balance text-3xl font-bold leading-tight tracking-[-.045em] sm:text-4xl">続けやすい、3つの記録</h2>
        <div className="mt-10 grid gap-4 md:grid-cols-[1.15fr_.85fr] md:grid-rows-2">{features.map((item, index) => <div key={item.number} className={`flex flex-col justify-between rounded-xl border border-[var(--line)] bg-white p-7 sm:p-9 ${index === 0 ? "md:row-span-2 md:min-h-[370px]" : ""}`}><div className="flex items-center justify-between"><span className="metric text-xs text-[var(--muted)]">/{item.number}</span><Icon name={item.icon} className="size-5 text-[var(--sage-deep)]" /></div><div><h3 className="mt-10 text-xl font-bold tracking-tight">{item.title}</h3><p className="mt-3 max-w-sm text-sm leading-7 text-[var(--muted)]">{item.text}</p></div></div>)}</div>
      </div>
    </section>
    <footer className="border-t border-[var(--line)] bg-white"><div className="mx-auto flex max-w-6xl flex-col justify-between gap-2 safe-gutters safe-bottom pt-7 text-left text-xs leading-6 text-[var(--muted)] sm:flex-row sm:gap-4"><span>BodyMake</span><span>{isFirebaseSelected ? "記録はアカウントごと、身体写真はこの端末に保存します。" : isCloudConfigured ? "記録はアカウントごとに保管されます。" : "現在はこのブラウザ内に記録を保存します。"}</span></div></footer>
  </main>;
}
