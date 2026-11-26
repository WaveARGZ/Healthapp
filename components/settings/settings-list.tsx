"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { GoogleDriveSettings } from "@/components/settings/google-drive-settings";
import { MealReminderSetting } from "@/components/settings/meal-reminder-setting";
import { clearDemoSession } from "@/lib/auth/demo-session";
import { signOutCloud } from "@/lib/auth/cognito-session";
import { isCloudConfigured, isSharedTestEnvironment } from "@/lib/cloud/config";
import { isFirebaseSelected } from "@/lib/firebase/config";
import { signOutFirebase } from "@/lib/auth/firebase-session";
import { stopMealReminders } from "@/lib/meals/meal-reminder-client";

const logoutClass = "text-link px-2 text-[var(--coral)] hover:underline";

export function SettingsList() {
  const router = useRouter();

  async function logout() {
    // Stop account-specific reminders where possible without blocking sign-out.
    if (isSharedTestEnvironment) await stopMealReminders().catch(() => {});
    await signOutFirebase();
    router.replace("/bodymake");
  }

  return <>
    <PageHeader title="設定" />
    <div className="space-y-5">
      <section className="panel" aria-labelledby="profile-settings-title">
        <h2 id="profile-settings-title" className="section-title">アカウント</h2>
        <Link href="/onboarding" className="mt-3 flex items-center gap-3 border-t border-[var(--line)] py-4 text-[var(--ink)] hover:text-[var(--sage-deep)]">
          <span className="min-w-0 flex-1"><span className="block font-bold">プロフィールを編集</span><span className="mt-0.5 block text-sm text-[var(--muted)]">名前・目標・身体情報</span></span>
          <Icon name="chevron-right" className="size-5 shrink-0 text-[var(--sage-deep)]" />
        </Link>
      </section>
      {isSharedTestEnvironment && isFirebaseSelected && <MealReminderSetting />}
      <section className="panel text-sm leading-7 text-[var(--muted)]" aria-labelledby="information-title">
        <h2 id="information-title" className="section-title">記録とプライバシー</h2>
        <details id="data" className="mt-3 border-t border-[var(--line)]">
          <summary className="min-h-12 cursor-pointer py-3 font-semibold text-[var(--ink)]">データ管理</summary>
          <p>{isFirebaseSelected ? "筋トレ・食事・体重・器具設定はFirebaseのアカウント別領域に保存されます。身体写真はこの端末のブラウザ内だけに保存され、別端末には同期されません。既存のAWS・デモ記録は自動移行されません。" : isCloudConfigured ? "筋トレ・食事・体重・身体写真はAWSのアカウント別領域に保存されます。学習用の修正データは別のデータベースに保管します。既存の端末内データは自動移行されません。" : "通常の食事・筋トレ・体重記録はこの端末のブラウザ内に保存されます。学習データの共有は任意で、毎回の同意とGoogleログインが必要です。共有されたデータはアプリ所有者のGoogle Driveに集約します。"}</p>
        </details>
        <details id="privacy" className="mt-3 border-t border-[var(--line)]">
          <summary className="min-h-12 cursor-pointer py-3 font-semibold text-[var(--ink)]">プライバシー</summary>
          <p>{isFirebaseSelected ? "身体写真はサーバーへ送らず、端末内で編集・保存します。ブラウザのデータ削除や端末交換では失われるため、必要な写真はご自身で保存してください。食事写真の学習用共有は別の同意フローです。" : isCloudConfigured ? "食事写真の解析は端末内で行います。同意して学習データを共有した場合、AIの判定スコア、正解料理名、栄養値だけを学習用データベースに送信します。食事写真そのものや氏名・メールアドレスは学習用テーブルに保存しません。身体写真は非公開のS3領域に保存されます。" : "食事写真の解析は端末内で行います。学習データ共有に同意した場合のみ、再圧縮して位置情報などのEXIFを除いた写真、AI候補、正解料理名・栄養値を共有Driveへ送ります。Googleアカウントは送信時の確認と不正利用対策に使用し、メールアドレスは学習データへ保存しません。認証トークンは保存しません。"}</p>
        </details>
        <details id="terms" className="mt-3 border-t border-[var(--line)]">
          <summary className="min-h-12 cursor-pointer py-3 font-semibold text-[var(--ink)]">利用について</summary>
          <p>{isFirebaseSelected || isCloudConfigured ? "現在は開発版です。栄養値は目安です。正式な利用規約は公開準備中です。" : "現在は開発版です。デモのログイン状態はこの端末だけに保存し、本人認証・データ保護は提供しません。栄養値は目安です。正式な利用規約は公開準備中です。"}</p>
        </details>
      </section>
      {(!isCloudConfigured || isFirebaseSelected) && <GoogleDriveSettings />}
    </div>
    <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-3">
      <span className="text-sm text-[var(--muted)]">BodyMake / 開発版</span>
      {isFirebaseSelected
        ? <button type="button" onClick={() => void logout()} className={logoutClass}>ログアウト</button>
        : isCloudConfigured
          ? <button type="button" onClick={signOutCloud} className={logoutClass}>ログアウト</button>
          : <Link href="/bodymake" onClick={clearDemoSession} className={logoutClass}>ログアウト</Link>}
    </div>
  </>;
}
