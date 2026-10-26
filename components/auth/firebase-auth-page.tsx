"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { bodyMakeClient } from "@/lib/api/client";
import { completeGoogleRedirect, currentFirebaseUser, signInWithGoogle, signOutFirebase, watchFirebaseUser } from "@/lib/auth/firebase-session";
import { isFirebaseConfigured } from "@/lib/firebase/config";
import { isSharedTestEnvironment } from "@/lib/cloud/config";
import { assertSharedTestAccess } from "@/lib/auth/shared-test-access";

export function FirebaseAuthPage() {
  const router = useRouter();
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const loginInProgress = useRef(false);

  const openRecords = useCallback(async () => {
    await assertSharedTestAccess(await currentFirebaseUser());
    const profile = await bodyMakeClient.getProfile();
    router.replace(profile ? "/dashboard" : "/onboarding?from=signup");
  }, [router]);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    let active = true;
    let unsubscribe: (() => void) | undefined;
    void completeGoogleRedirect()
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "Googleログインを完了できませんでした。");
      })
      .then(() => {
        if (!active) return;
        unsubscribe = watchFirebaseUser((user) => {
          setChecking(false);
          if (!user || loginInProgress.current) return;
          setBusy(true);
          void openRecords()
            .catch((reason) => { if (active) { setBusy(false); setError(reason instanceof Error ? reason.message : "記録の読み込みに失敗しました。"); } });
        });
      });
    return () => { active = false; unsubscribe?.(); };
  }, [openRecords]);

  async function login() {
    loginInProgress.current = true;
    setBusy(true);
    setError("");
    try {
      const user = await signInWithGoogle(remember);
      // A redirect reloads this page; the effect above completes that flow.
      if (user) await openRecords();
    } catch (reason) {
      setBusy(false);
      setError(reason instanceof Error ? reason.message : "Googleログインを完了できませんでした。");
    } finally {
      loginInProgress.current = false;
    }
  }

  return <main className="setup-page"><div className="setup-content">
    <Logo />
    <div className="setup-heading"><p className="setup-step">身体づくりの記録帳</p><h1 className="setup-title">ログイン・新規登録</h1><p className="mt-3 text-sm leading-6 text-[var(--muted)]">Googleアカウントで記録を続けられます。</p></div>
    {isFirebaseConfigured ? <div className="mt-8">
      <Button type="button" className="min-h-13 w-full gap-3" disabled={busy || checking} onClick={() => void login()}><svg aria-hidden="true" className="size-5" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.798 2.716v2.258h2.909c1.702-1.567 2.685-3.874 2.685-6.614Z" /><path fill="#34A853" d="M9 18c2.43 0 4.468-.806 5.955-2.181l-2.909-2.258c-.806.54-1.837.859-3.046.859-2.344 0-4.328-1.584-5.036-3.71H.957v2.332A9 9 0 0 0 9 18Z" /><path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A9 9 0 0 0 0 9c0 1.453.348 2.83.957 4.042l3.007-2.332Z" /><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.442 1.345l2.582-2.582C13.464.891 11.426 0 9 0A9 9 0 0 0 .957 4.958L3.964 7.29C4.672 5.164 6.656 3.58 9 3.58Z" /></svg>{busy || checking ? "確認中…" : "Googleで続ける"}</Button>
      <label className="mt-4 flex min-h-11 items-center gap-3 text-sm text-[var(--muted)]"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} className="size-4 accent-[var(--sage-deep)]" />ログインを記憶し、次回からホームを開く</label>
    </div> : <p role="alert" className="mt-8 rounded-md bg-[var(--coral-soft)] p-4 text-sm leading-6 text-[var(--coral)]">Firebaseの接続設定が未完了です。利用開始前に管理者が設定してください。</p>}
    {error ? <div className="mt-4"><p role="alert" className="break-words rounded-md bg-[var(--coral-soft)] p-3 text-sm text-[var(--coral)]">{error}</p>{isSharedTestEnvironment && <Button type="button" variant="secondary" className="mt-3 w-full" disabled={busy} onClick={() => void signOutFirebase().then(() => setError("")).catch(() => setError("ログアウトできませんでした。通信を確認してください。"))}>ログアウトして別のGoogleアカウントを使う</Button>}</div> : null}
    <p className="mt-5 text-xs leading-6 text-[var(--muted)]">筋トレ・食事・体重はアカウントごとに保存します。身体写真はこの端末だけに保存し、クラウドへ送りません。</p>
    <Link href="/bodymake" className="mt-6 inline-flex min-h-11 items-center text-sm font-semibold text-[var(--sage-deep)]">トップへ戻る</Link>
  </div></main>;
}
