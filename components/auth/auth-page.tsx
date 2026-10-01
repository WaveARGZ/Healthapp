"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { FieldLabel, TextInput } from "@/components/ui/form-fields";
import { Icon } from "@/components/ui/icon";
import { Logo } from "@/components/ui/logo";

interface AuthPageProps {
  mode: "login" | "signup";
}

export function AuthPage({ mode }: AuthPageProps) {
  const router = useRouter();
  const isLogin = mode === "login";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Cognito sign-in/sign-up will be wired here. Keep the MVP navigable.
    router.push(isLogin ? "/dashboard" : "/onboarding?from=signup");
  }

  return (
    <main className="min-h-dvh bg-[var(--canvas)] px-5 py-7 sm:px-7">
      <div className="mx-auto w-full max-w-md">
        <Logo />
        <div className="mt-14">
          <p className="text-xs font-bold tracking-[0.14em] text-[var(--sage-deep)]">WELCOME</p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-[-0.05em] text-[var(--ink)]">
            {isLogin ? "おかえりなさい。" : "理想の身体づくりを、ここから。"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            {isLogin ? "記録を続けるほど、変化が見えてきます。" : "まずはアカウントを作成して、変化の記録を始めましょう。"}
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

        <p className="mt-7 text-center text-sm text-[var(--muted)]">
          {isLogin ? "アカウントをお持ちでないですか？" : "すでにアカウントをお持ちですか？"}{" "}
          <Link href={isLogin ? "/signup" : "/login"} className="font-bold text-[var(--sage-deep)] underline-offset-4 hover:underline">
            {isLogin ? "新規登録" : "ログイン"}
          </Link>
        </p>
      </div>
    </main>
  );
}
