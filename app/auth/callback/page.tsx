"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { completeCloudSignIn } from "@/lib/auth/cognito-session";
import { bodyMakeClient } from "@/lib/api/client";
import { Logo } from "@/components/ui/logo";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error")) { queueMicrotask(() => setError("認証がキャンセルされたか、完了しませんでした。もう一度お試しください。")); return; }
    void completeCloudSignIn(params).then(() => bodyMakeClient.getProfile()).then((profile) => router.replace(profile ? "/dashboard" : "/onboarding?from=signup")).catch((reason) => setError(reason instanceof Error ? reason.message : "認証に失敗しました。"));
  }, [router]);
  return <main className="setup-page"><div className="setup-content">
    <Logo />
    <div className="setup-heading">
      <p className="setup-step">アカウントの確認</p>
      <h1 className="setup-title">{error ? "ログインを確認できませんでした" : "ログインしています"}</h1>
      <p role={error ? "alert" : "status"} className={`mt-5 break-words text-sm leading-7 ${error ? "rounded-md bg-[var(--coral-soft)] p-4 text-[var(--coral)]" : "text-[var(--muted)]"}`}>{error || "アカウントを確認しています。このまま少しお待ちください。"}</p>
      {error ? <Link className="mt-6 flex min-h-12 w-full items-center justify-center rounded-md bg-[var(--sage-deep)] px-5 text-sm font-semibold text-white hover:bg-[var(--ink)]" href="/login">ログインに戻る</Link> : null}
    </div>
  </div></main>;
}
