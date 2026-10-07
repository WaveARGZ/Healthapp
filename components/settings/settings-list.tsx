"use client";

import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { GoogleDriveSettings } from "@/components/settings/google-drive-settings";
import { clearDemoSession } from "@/lib/auth/demo-session";

const settings: Array<{ label: string; description: string; icon: IconName; href: string }> = [
  { label: "プロフィール", description: "名前・目標・身体情報", icon: "user", href: "/onboarding" },
  { label: "データ管理", description: "記録の保存先について", icon: "progress", href: "#data" },
  { label: "プライバシー", description: "写真とデータの取り扱い", icon: "lock", href: "#privacy" },
  { label: "利用規約", description: "ご利用の前に", icon: "more", href: "#terms" },
];

export function SettingsList() {
  return <>
    <PageHeader title="設定" description="プロフィールと、アプリについて。" />
    <div className="border-t border-[var(--line)]">{settings.map((item) => <Link key={item.label} href={item.href} className="flex min-h-24 items-center gap-4 border-b border-[var(--line)] px-1 py-5 hover:bg-[var(--sand)]"><Icon name={item.icon} className="size-5 shrink-0 text-[var(--sage-deep)]" /><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{item.label}</span><span className="mt-1 block text-xs text-[var(--muted)]">{item.description}</span></span><Icon name="chevron-right" className="size-4 text-[var(--muted)]" /></Link>)}</div>
    <Link href="/" onClick={clearDemoSession} className="mt-6 inline-flex min-h-12 items-center gap-3 text-sm font-semibold text-[var(--coral)]">ログアウト<Icon name="arrow-right" className="size-4" /></Link>
    <GoogleDriveSettings />
    <div className="mt-10 space-y-8 border-t border-[var(--line)] pt-8 text-xs leading-7 text-[var(--muted)]">
      <section id="data" className="scroll-mt-6"><h2 className="mb-2 font-semibold text-[var(--ink)]">データ管理</h2><p>通常の食事・筋トレ・体重記録はこの端末のブラウザ内に保存されます。学習データの共有は任意で、毎回の同意とGoogleログインが必要です。共有されたデータはアプリ所有者のGoogle Driveに集約します。</p></section>
      <section id="privacy" className="scroll-mt-6"><h2 className="mb-2 font-semibold text-[var(--ink)]">プライバシー</h2><p>食事写真の解析は端末内で行います。学習データ共有に同意した場合のみ、再圧縮して位置情報などのEXIFを除いた写真、AI候補、正解料理名・栄養値を共有Driveへ送ります。Googleアカウントは送信時の確認と不正利用対策に使用し、メールアドレスは学習データへ保存しません。認証トークンは保存しません。</p></section>
      <section id="terms" className="scroll-mt-6"><h2 className="mb-2 font-semibold text-[var(--ink)]">利用について</h2><p>現在は開発中のMVPです。ログイン状態の記憶はこの端末だけのデモ機能で、アカウント認証・データ保護を提供するものではありません。栄養値は目安、身体の加工画像は比較用のイメージです。正式な利用規約は公開準備中です。</p></section>
    </div>
    <p className="mt-10 border-t border-[var(--line)] pt-5 text-[11px] text-[var(--muted)]">BodyMake / 開発版</p>
  </>;
}
