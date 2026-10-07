"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldLabel, TextInput } from "@/components/ui/form-fields";
import { Icon } from "@/components/ui/icon";
import { Logo } from "@/components/ui/logo";
import { hasDemoSession, setDemoSession } from "@/lib/auth/demo-session";

interface AuthPageProps {
  mode: "login" | "signup";
}

export function AuthPage({ mode }: AuthPageProps) {
  const router = useRouter();
  const isLogin = mode === "login";
  const [rememberLogin, setRememberLogin] = useState(true);

  useEffect(() => {
    if (isLogin && hasDemoSession()) router.replace("/dashboard");
  }, [isLogin, router]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // This is a local demo session only; Cognito authentication is not wired yet.
    setDemoSession(isLogin ? rememberLogin : true);
    router.push(isLogin ? "/dashboard" : "/onboarding?from=signup");
  }

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
