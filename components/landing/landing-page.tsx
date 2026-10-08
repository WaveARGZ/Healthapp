"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Icon, type IconName } from "@/components/ui/icon";
import { Logo } from "@/components/ui/logo";
import { hasDemoSession } from "@/lib/auth/demo-session";
import { hasCloudSession } from "@/lib/auth/cognito-session";
import { isCloudConfigured } from "@/lib/cloud/config";

const features: Array<{ number: string; icon: IconName; title: string; text: string }> = [
  { number: "01", icon: "dumbbell", title: "トレーニングを残す", text: "種目を選んで、重さと回数をセットごとに。前回の記録も振り返れます。" },
  { number: "02", icon: "leaf", title: "食べたものを知る", text: "料理名で検索、または写真から。食事ごとのカロリーと栄養を記録します。" },
  { number: "03", icon: "camera", title: "身体の変化を見る", text: "体重と、正面・背面の写真。同じ条件で残すと、小さな変化がわかります。" },
];

export function LandingPage() {
  const router = useRouter();
  useEffect(() => { if (isCloudConfigured ? hasCloudSession() : hasDemoSession()) router.replace("/dashboard"); }, [router]);

  return <main className="min-h-dvh bg-white">
    <header className="safe-top border-b border-[var(--line)]">
      <div className="mx-auto flex min-h-20 max-w-6xl items-center justify-between gap-3 safe-gutters">
        <Logo /><Link href="/login" className="text-link shrink-0 text-[var(--ink)]">ログイン<Icon name="arrow-right" className="size-4" /></Link>
      </div>
    </header>
    <section className="mx-auto grid max-w-6xl gap-8 safe-gutters pb-12 pt-10 sm:gap-12 sm:py-20 lg:grid-cols-[1.15fr_1fr] lg:items-center lg:gap-16 lg:py-24">
      <div className="min-w-0">
        <p className="mb-4 flex items-center justify-center gap-3 text-center text-xs font-semibold tracking-wider text-[var(--sage-deep)] sm:mb-6"><span aria-hidden="true" className="h-px w-6 bg-current" />身体づくりの記録帳<span aria-hidden="true" className="h-px w-6 bg-current" /></p>
        <h1 className="text-center text-[clamp(2rem,6.5vw,3.5rem)] font-bold leading-[1.5] tracking-[-0.05em]">理想の身体を、<br />見える目標に。</h1>
        <p className="mx-auto mt-4 max-w-md text-center text-sm leading-7 text-[var(--muted)] sm:mt-6 sm:leading-8">何を食べたか。どれだけ動いたか。<br />そして、身体はどう変わったか。<br />毎日の記録を、ひとつの場所に。</p>
        <Link href="/signup" className="relative mx-auto mt-6 flex min-h-14 w-full max-w-64 items-center justify-center rounded-md bg-[var(--sage-deep)] px-12 text-base font-semibold text-white hover:bg-[var(--ink)] sm:mt-8">はじめる<Icon name="arrow-right" className="absolute right-5 size-5" /></Link>
        <p className="mt-3 text-center text-xs leading-6 text-[var(--muted)]">筋トレ・食事・体重・写真をまとめて記録</p>
      </div>
      <div className="relative min-w-0 border border-[var(--line)] bg-[var(--sand)] p-5 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-[var(--ink)] pb-4"><p className="text-lg font-bold">わたしの記録</p><span className="text-xs text-[var(--muted)]">記録のイメージ</span></div>
        <div className="flex items-end justify-between border-b border-[var(--line)] py-6"><div><p className="text-xs text-[var(--muted)]">今日の体重</p><p className="metric mt-2 text-5xl font-medium">62.5<span className="ml-2 text-sm text-[var(--muted)]">kg</span></p></div><Icon name="scale" className="mb-1 size-6 text-[var(--sage-deep)]" /></div>
        {[
          { icon: "dumbbell" as const, title: "筋トレ", value: "ベンチプレス", detail: "60 kg × 10回 × 3セット" },
          { icon: "leaf" as const, title: "食事", value: "ご飯・焼き鮭・味噌汁", detail: "朝食を記録" },
          { icon: "camera" as const, title: "身体写真", value: "正面と背面", detail: "変化を写真で確認" },
        ].map((item) => <div key={item.title} className="flex items-start gap-3 border-b border-[var(--line)] py-5 last:border-b-0 sm:gap-4"><Icon name={item.icon} className="mt-1 size-5 shrink-0 text-[var(--sage-deep)]" /><div className="min-w-0 flex-1"><p className="text-xs text-[var(--muted)]">{item.title}</p><p className="mt-1 text-sm font-semibold leading-6">{item.value}</p><p className="mt-1 text-xs leading-5 text-[var(--muted)]">{item.detail}</p></div><Icon name="check" className="mt-5 size-4 shrink-0 text-[var(--sage-deep)]" /></div>)}
      </div>
    </section>
    <section className="border-t border-[var(--line)]">
      <div className="mx-auto max-w-6xl safe-gutters py-12 sm:py-16">
        <h2 className="text-balance text-center text-xl font-bold leading-relaxed tracking-tight sm:text-2xl">記録することは、シンプルに。</h2>
        <div className="mt-10 grid gap-8 md:grid-cols-3 md:gap-10">{features.map((item) => <div key={item.number} className="border-t border-[var(--line)] pt-5 text-center"><div className="flex items-center justify-center gap-3"><span className="metric text-xs text-[var(--muted)]">{item.number}</span><Icon name={item.icon} className="size-5 text-[var(--sage-deep)]" /></div><h3 className="mt-4 text-base font-bold">{item.title}</h3><p className="mt-3 text-sm leading-7 text-[var(--muted)]">{item.text}</p></div>)}</div>
      </div>
    </section>
    <footer className="border-t border-[var(--line)]"><div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 safe-gutters safe-bottom pt-6 text-center text-xs leading-6 text-[var(--muted)] sm:flex-row sm:gap-4 sm:text-left"><span>BodyMake</span><span>{isCloudConfigured ? "記録はアカウントごとに保管されます。" : "現在はこのブラウザ内に記録を保存します。"}</span></div></footer>
  </main>;
}
