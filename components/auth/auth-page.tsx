"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldLabel, TextInput } from "@/components/ui/form-fields";
import { Icon } from "@/components/ui/icon";
import { Logo } from "@/components/ui/logo";
import { hasDemoSession, setDemoSession } from "@/lib/auth/demo-session";
import { beginCloudSignIn, hasCloudSession } from "@/lib/auth/cognito-session";
import { cloudConfig, isCloudConfigured } from "@/lib/cloud/config";

interface AuthPageProps {
  mode: "login" | "signup";
}

function GoogleMark() {
  return <svg aria-hidden="true" className="absolute left-4 size-5" viewBox="0 0 18 18">
    <path fill="#EA4335" d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.798 2.716v2.258h2.909c1.702-1.567 2.685-3.874 2.685-6.614Z" />
    <path fill="#4285F4" d="M9 18c2.43 0 4.468-.806 5.955-2.181l-2.909-2.258c-.806.54-1.837.859-3.046.859-2.344 0-4.328-1.584-5.036-3.71H.957v2.332A9 9 0 0 0 9 18Z" />
    <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A9 9 0 0 0 0 9c0 1.453.348 2.83.957 4.042l3.007-2.332Z" />
    <path fill="#34A853" d="M9 3.58c1.321 0 2.508.454 3.442 1.345l2.582-2.582C13.464.891 11.426 0 9 0A9 9 0 0 0 .957 4.958L3.964 7.29C4.672 5.164 6.656 3.58 9 3.58Z" />
  </svg>;
}

export function AuthPage({ mode }: AuthPageProps) {
  const router = useRouter();
  const isLogin = mode === "login";
  const [rememberLogin, setRememberLogin] = useState(true);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    if (isLogin && (isCloudConfigured ? hasCloudSession() : hasDemoSession())) router.replace("/dashboard");
  }, [isLogin, router]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDemoSession(isLogin ? rememberLogin : true);
    router.push(isLogin ? "/dashboard" : "/onboarding?from=signup");
  }

  if (isCloudConfigured) return <main className="setup-page"><div className="setup-content">
    <Logo />
    <div className="setup-heading"><p className="setup-step">身体づくりの記録帳</p><h1 className="setup-title">{isLogin ? "ログイン" : "新規登録"}</h1><p className="mt-3 text-sm leading-6 text-[var(--muted)]">アカウント情報はAWSの認証画面で安全に入力します。</p></div>
    {isLogin ? <label className="mt-9 flex min-h-11 items-center gap-2 text-xs font-medium text-[var(--muted)]"><input type="checkbox" checked={rememberLogin} onChange={(event) => setRememberLogin(event.target.checked)} className="size-4 accent-[var(--sage-deep)]" />この端末でログイン状態を記憶する</label> : null}
    {cloudConfig.googleSignInEnabled ? <>
      <Button type="button" variant="secondary" className={`${isLogin ? "mt-4" : "mt-9"} relative w-full border-[#c9d0cc] bg-white text-[var(--ink)] shadow-sm hover:bg-[#f8faf8]`} onClick={() => void beginCloudSignIn(false, isLogin ? rememberLogin : true, "Google").catch((error) => setAuthError(error instanceof Error ? error.message : "Googleログインを開始できませんでした。"))}><GoogleMark />Googleで続ける</Button>
      <div className="my-5 flex items-center gap-3 text-[11px] font-medium text-[var(--muted)]"><span className="h-px flex-1 bg-[var(--line)]" />または<span className="h-px flex-1 bg-[var(--line)]" /></div>
    </> : null}
    <Button type="button" className={`${cloudConfig.googleSignInEnabled ? "" : isLogin ? "mt-4" : "mt-9"} w-full`} onClick={() => void beginCloudSignIn(!isLogin, isLogin ? rememberLogin : true).catch((error) => setAuthError(error instanceof Error ? error.message : "ログインを開始できませんでした。"))}>{isLogin ? "メールアドレスでログイン" : "メールアドレスで新規登録"}</Button>
    {authError ? <p role="alert" className="mt-3 text-xs text-[var(--coral)]">{authError}</p> : null}
    <p className="mt-5 text-xs leading-6 text-[var(--muted)]">{isLogin ? "メールアドレスとパスワード、またはGoogleアカウントでログインできます。" : "メールアドレスとパスワード、またはGoogleアカウントで登録し、続けてプロフィールで名前や目標を設定します。"} 記録はアカウントごとに分けて保存します。</p>
    <p className="mt-7 text-center text-xs leading-7 text-[var(--muted)]">{isLogin ? "アカウントをお持ちでないですか？" : "すでにアカウントをお持ちですか？"} <Link href={isLogin ? "/signup" : "/login"} className="font-bold text-[var(--sage-deep)] underline-offset-4 hover:underline">{isLogin ? "新規登録" : "ログイン"}</Link></p>
  </div></main>;

  return (
    <main className="setup-page">
      <div className="setup-content">
        <Logo />
        <div className="setup-heading">
          <p className="setup-step">身体づくりの記録帳</p>
          <h1 className="setup-title">
            {isLogin ? "ログイン" : "新規登録"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            {isLogin ? "今日の記録をつけましょう。" : "まずは基本情報を入力してください。"}
          </p>
        </div>

        <form className="mt-9 space-y-5" onSubmit={handleSubmit}>
          {!isLogin ? (
            <div>
              <FieldLabel htmlFor="name">名前</FieldLabel>
              <TextInput id="name" name="name" placeholder="例：山田 太郎" autoComplete="name" required />
            </div>
          ) : null}
          <div>
            <FieldLabel htmlFor="email">メールアドレス</FieldLabel>
            <div className="relative">
              <Icon name="mail" className="pointer-events-none absolute left-3.5 top-3.5 size-5 text-[#9aa19e]" />
              <TextInput id="email" name="email" type="email" placeholder="you@example.com" autoComplete="email" className="pl-11" required />
            </div>
          </div>
          <div>
            <FieldLabel htmlFor="password">パスワード</FieldLabel>
            <div className="relative">
              <Icon name="lock" className="pointer-events-none absolute left-3.5 top-3.5 size-5 text-[#9aa19e]" />
              <TextInput id="password" name="password" type="password" placeholder="8文字以上" autoComplete={isLogin ? "current-password" : "new-password"} className="pl-11" required minLength={8} />
            </div>
          </div>
          {isLogin ? <label className="flex min-h-11 items-center gap-2 text-xs font-medium text-[var(--muted)]"><input type="checkbox" checked={rememberLogin} onChange={(event) => setRememberLogin(event.target.checked)} className="size-4 accent-[var(--sage-deep)]" />ログイン状態を記憶する</label> : null}
          {!isLogin ? (
            <div>
              <FieldLabel htmlFor="confirm-password">パスワード確認</FieldLabel>
              <TextInput id="confirm-password" name="confirm-password" type="password" placeholder="もう一度入力" autoComplete="new-password" required minLength={8} />
            </div>
          ) : null}
          <Button type="submit" className="mt-2 w-full">
            {isLogin ? "ログイン" : "登録してはじめる"}
          </Button>
        </form>

        <p className="mt-4 border-l-2 border-[var(--line)] pl-3 text-[11px] leading-6 text-[var(--muted)]">現在は認証未接続のデモ版です。パスワードは送信・保存されません。チェックを付けると、この端末にログイン状態を記憶します。</p>
        <p className="mt-7 text-center text-xs leading-7 text-[var(--muted)]">
          {isLogin ? "アカウントをお持ちでないですか？" : "すでにアカウントをお持ちですか？"}{" "}
          <Link href={isLogin ? "/signup" : "/login"} className="font-bold text-[var(--sage-deep)] underline-offset-4 hover:underline">
            {isLogin ? "新規登録" : "ログイン"}
          </Link>
        </p>
      </div>
    </main>
  );
}
