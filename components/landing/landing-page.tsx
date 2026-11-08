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

  return <main className="min-h-dvh bg-[var(--sand)]">
    <header className="safe-top border-b border-[var(--line)] bg-white">
      <div className="mx-auto flex min-h-20 max-w-6xl items-center justify-between gap-3 safe-gutters">
        <Logo /><Link href="/login" className="text-link shrink-0 text-[var(--ink)]">ログイン<Icon name="arrow-right" className="size-4" /></Link>
      </div>
    </header>
    <section className="safe-gutters mx-auto max-w-6xl pt-5 sm:pt-8">
    <div className="grid gap-8 rounded-[28px] bg-[#19182f] px-5 py-10 text-white shadow-[0_20px_44px_rgba(25,24,47,.14)] sm:gap-10 sm:px-10 sm:py-14 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-14 lg:px-14">
      <div className="min-w-0">
        <p className="mb-4 text-xs font-bold tracking-[.18em] text-[#c1bde4]">BODYMAKE · 毎日の記録</p>
        <h1 className="text-[clamp(2rem,6.5vw,3.5rem)] font-bold leading-[1.35] tracking-[-0.05em]">理想の身体を、<br />見える目標に。</h1>
        <p className="mt-5 max-w-md text-sm leading-7 text-[#d5d2e9] sm:leading-8">食事・筋トレ・体重・身体写真。毎日の記録をまとめて、変化を振り返れます。</p>
        <Link href="/signup" className="mt-7 inline-flex min-h-14 w-full max-w-64 items-center justify-center gap-3 rounded-xl bg-[var(--sage-deep)] px-6 text-base font-bold text-white hover:bg-[#24432e]">はじめる<Icon name="arrow-right" className="size-5" /></Link>
        <p className="mt-3 text-xs leading-6 text-[#d5d2e9]">筋トレ・食事・体重・写真をまとめて記録</p>
        <Link href="/food-photo" className="mt-5 flex min-h-12 max-w-64 items-center justify-center rounded-xl border border-white/50 px-4 text-center text-sm font-semibold text-white hover:bg-white/10">食事写真AIを無料で試す</Link>
        <p className="mt-2 max-w-80 text-xs leading-6 text-[#d5d2e9]">{isSharedTestEnvironment ? "写真の解析はログイン不要。テスト環境では学習共有を行いません。" : "写真の解析はログイン不要。正解の共有は任意です。"}</p>
      </div>
      <div className="relative min-w-0 rounded-2xl bg-white p-5 text-[var(--ink)] shadow-[0_16px_36px_rgba(0,0,0,.12)] sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-[var(--line)] pb-4"><p className="text-lg font-bold">わたしの記録</p><span className="text-xs text-[var(--muted)]">記録のイメージ</span></div>
        <div className="flex items-end justify-between border-b border-[var(--line)] py-6"><div><p className="text-xs text-[var(--muted)]">今日の体重</p><p className="metric mt-2 text-5xl font-medium">62.5<span className="ml-2 text-sm text-[var(--muted)]">kg</span></p></div><Icon name="scale" className="mb-1 size-6 text-[var(--sage-deep)]" /></div>
        {[
          { icon: "dumbbell" as const, title: "筋トレ", value: "ベンチプレス", detail: "60 kg × 10回 × 3セット" },
          { icon: "leaf" as const, title: "食事", value: "ご飯・焼き鮭・味噌汁", detail: "朝食を記録" },
          { icon: "camera" as const, title: "身体写真", value: "正面と背面", detail: "変化を写真で確認" },
        ].map((item) => <div key={item.title} className="flex items-start gap-3 border-b border-[var(--line)] py-5 last:border-b-0 sm:gap-4"><Icon name={item.icon} className="mt-1 size-5 shrink-0 text-[var(--sage-deep)]" /><div className="min-w-0 flex-1"><p className="text-xs text-[var(--muted)]">{item.title}</p><p className="mt-1 text-sm font-semibold leading-6">{item.value}</p><p className="mt-1 text-xs leading-5 text-[var(--muted)]">{item.detail}</p></div><Icon name="check" className="mt-5 size-4 shrink-0 text-[var(--sage-deep)]" /></div>)}
      </div>
    </div></section>
    <section>
      <div className="mx-auto max-w-6xl safe-gutters py-12 sm:py-16">
        <h2 className="text-balance text-xl font-bold leading-relaxed tracking-tight sm:text-2xl">続けやすい、3つの記録</h2>
        <div className="mt-6 grid gap-3 md:grid-cols-3">{features.map((item) => <div key={item.number} className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-[0_6px_18px_rgba(32,38,34,.04)] sm:p-6"><div className="flex items-center gap-3"><span className="metric text-xs text-[var(--muted)]">{item.number}</span><span className="grid size-10 place-items-center rounded-xl bg-[var(--sage-soft)]"><Icon name={item.icon} className="size-5 text-[var(--sage-deep)]" /></span></div><h3 className="mt-4 text-base font-bold">{item.title}</h3><p className="mt-2 text-sm leading-7 text-[var(--muted)]">{item.text}</p></div>)}</div>
      </div>
    </section>
    <footer className="border-t border-[var(--line)] bg-white"><div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 safe-gutters safe-bottom pt-6 text-center text-xs leading-6 text-[var(--muted)] sm:flex-row sm:gap-4 sm:text-left"><span>BodyMake</span><span>{isFirebaseSelected ? "記録はアカウントごと、身体写真はこの端末に保存します。" : isCloudConfigured ? "記録はアカウントごとに保管されます。" : "現在はこのブラウザ内に記録を保存します。"}</span></div></footer>
  </main>;
}
