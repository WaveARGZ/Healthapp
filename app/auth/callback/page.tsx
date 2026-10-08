"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { completeCloudSignIn } from "@/lib/auth/cognito-session";
import { bodyMakeClient } from "@/lib/api/client";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error")) { queueMicrotask(() => setError("認証がキャンセルされたか、完了しませんでした。もう一度お試しください。")); return; }
    void completeCloudSignIn(params).then(() => bodyMakeClient.getProfile()).then((profile) => router.replace(profile ? "/dashboard" : "/onboarding?from=signup")).catch((reason) => setError(reason instanceof Error ? reason.message : "認証に失敗しました。"));
  }, [router]);
  return <main className="setup-page"><div className="setup-content"><h1 className="setup-title">ログイン確認</h1><p role="status" className="mt-5 text-sm text-[var(--muted)]">{error || "ログイン情報を確認しています…"}</p>{error ? <Link className="mt-5 inline-block text-sm font-bold text-[var(--sage-deep)]" href="/login">ログインに戻る</Link> : null}</div></main>;
}
