"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { GoogleDriveSettings } from "@/components/settings/google-drive-settings";
import { clearDemoSession } from "@/lib/auth/demo-session";
import { signOutCloud } from "@/lib/auth/cognito-session";
import { isCloudConfigured } from "@/lib/cloud/config";
import { isFirebaseSelected } from "@/lib/firebase/config";
import { signOutFirebase } from "@/lib/auth/firebase-session";

const informationLinks: Array<{ label: string; icon: IconName; href: string }> = [
  { label: "データ管理", icon: "progress", href: "#data" },
  { label: "プライバシー", icon: "lock", href: "#privacy" },
  { label: "利用について", icon: "more", href: "#terms" },
];

const logoutClass = "text-link px-2 text-[var(--coral)] hover:underline";

export function SettingsList() {
  const router = useRouter();
  return <>
    <PageHeader title="設定" description="プロフィールの編集と、写真・記録の取り扱いを確認できます。" />
    <div className="space-y-5">
      <section className="panel" aria-labelledby="profile-settings-title">
        <h2 id="profile-settings-title" className="section-title">アカウント</h2>
        <Link href="/onboarding" className="mt-4 flex items-center gap-4 rounded-xl bg-[var(--sage-soft)] px-4 py-4 text-[var(--ink)] transition-colors hover:bg-[var(--sand)]">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white text-[var(--sage-deep)]"><Icon name="user" className="size-5" /></span>
          <span className="min-w-0 flex-1"><span className="block font-bold">プロフィールを編集</span><span className="mt-0.5 block text-sm text-[var(--muted)]">名前・目標・身体情報</span></span>
          <Icon name="chevron-right" className="size-5 shrink-0 text-[var(--sage-deep)]" />
        </Link>
      </section>
      <section className="panel text-sm leading-7 text-[var(--muted)]" aria-labelledby="information-title">
        <h2 id="information-title" className="section-title">記録とプライバシー</h2>
        <div className="mb-3 mt-2 flex flex-wrap gap-x-4">
          {informationLinks.map(({ label, href, icon }) => <a key={href} href={href} className="text-link underline decoration-[var(--line)] underline-offset-4"><Icon name={icon} className="size-4" />{label}</a>)}
        </div>
        <section id="data" className="scroll-mt-24 border-t border-[var(--line)] py-5 last:pb-0">
          <h3 className="mb-2 text-lg font-bold text-[var(--ink)]">データ管理</h3>
          <p>{isFirebaseSelected ? "筋トレ・食事・体重・器具設定はFirebaseのアカウント別領域に保存されます。身体写真はこの端末のブラウザ内だけに保存され、別端末には同期されません。既存のAWS・デモ記録は自動移行されません。" : isCloudConfigured ? "筋トレ・食事・体重・身体写真はAWSのアカウント別領域に保存されます。学習用の修正データは別のデータベースに保管します。既存の端末内データは自動移行されません。" : "通常の食事・筋トレ・体重記録はこの端末のブラウザ内に保存されます。学習データの共有は任意で、毎回の同意とGoogleログインが必要です。共有されたデータはアプリ所有者のGoogle Driveに集約します。"}</p>
        </section>
        <section id="privacy" className="scroll-mt-24 border-t border-[var(--line)] py-5 last:pb-0">
          <h3 className="mb-2 text-lg font-bold text-[var(--ink)]">プライバシー</h3>
          <p>{isFirebaseSelected ? "身体写真はサーバーへ送らず、端末内で編集・保存します。ブラウザのデータ削除や端末交換では失われるため、必要な写真はご自身で保存してください。食事写真の学習用共有は別の同意フローです。" : isCloudConfigured ? "食事写真の解析は端末内で行います。同意して学習データを共有した場合、AIの判定スコア、正解料理名、栄養値だけを学習用データベースに送信します。食事写真そのものや氏名・メールアドレスは学習用テーブルに保存しません。身体写真は非公開のS3領域に保存されます。" : "食事写真の解析は端末内で行います。学習データ共有に同意した場合のみ、再圧縮して位置情報などのEXIFを除いた写真、AI候補、正解料理名・栄養値を共有Driveへ送ります。Googleアカウントは送信時の確認と不正利用対策に使用し、メールアドレスは学習データへ保存しません。認証トークンは保存しません。"}</p>
        </section>
        <section id="terms" className="scroll-mt-24 border-t border-[var(--line)] py-5 last:pb-0">
          <h3 className="mb-2 text-lg font-bold text-[var(--ink)]">利用について</h3>
          <p>{isFirebaseSelected || isCloudConfigured ? "現在は開発中のMVPです。栄養値は目安、身体の加工画像は比較用のイメージです。正式な利用規約は公開準備中です。" : "現在は開発中のMVPです。ログイン状態の記憶はこの端末だけのデモ機能で、アカウント認証・データ保護を提供するものではありません。栄養値は目安、身体の加工画像は比較用のイメージです。正式な利用規約は公開準備中です。"}</p>
        </section>
      </section>
      {(!isCloudConfigured || isFirebaseSelected) && <GoogleDriveSettings />}
    </div>
    <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-3">
      <span className="text-sm text-[var(--muted)]">BodyMake / 開発版</span>
      {isFirebaseSelected
        ? <button type="button" onClick={() => void signOutFirebase().then(() => router.replace("/bodymake"))} className={logoutClass}>ログアウト<Icon name="arrow-right" className="size-4" /></button>
        : isCloudConfigured
          ? <button type="button" onClick={signOutCloud} className={logoutClass}>ログアウト<Icon name="arrow-right" className="size-4" /></button>
          : <Link href="/bodymake" onClick={clearDemoSession} className={logoutClass}>ログアウト<Icon name="arrow-right" className="size-4" /></Link>}
    </div>
  </>;
}
