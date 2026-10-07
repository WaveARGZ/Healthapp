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
      <section id="data" className="scroll-mt-6"><h2 className="mb-2 font-semibold text-[var(--ink)]">データ管理</h2><p>通常の食事・筋トレ・体重記録はこの端末のブラウザ内に保存されます。正解データは設定したGoogle Driveにも追加保存できます。ブラウザのデータ削除に備え、Drive設定と同期をご利用ください。</p></section>
      <section id="privacy" className="scroll-mt-6"><h2 className="mb-2 font-semibold text-[var(--ink)]">プライバシー</h2><p>身体写真の加工と食事写真の解析は端末内で行います。Google Driveを設定し、正解登録を確定した場合のみ、その食事写真とラベルをGoogle Driveにアップロードします。Google Driveのアクセストークンは保存せず、Googleから短時間だけ発行されます。食事写真の解析モデルは初回に外部からダウンロードします。</p></section>
      <section id="terms" className="scroll-mt-6"><h2 className="mb-2 font-semibold text-[var(--ink)]">利用について</h2><p>現在は開発中のMVPです。ログイン状態の記憶はこの端末だけのデモ機能で、アカウント認証・データ保護を提供するものではありません。栄養値は目安、身体の加工画像は比較用のイメージです。正式な利用規約は公開準備中です。</p></section>
    </div>
    <p className="mt-10 border-t border-[var(--line)] pt-5 text-[11px] text-[var(--muted)]">BodyMake / 開発版</p>
  </>;
}
