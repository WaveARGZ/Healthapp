"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { AuthFrame, GoogleMark, StorageNote } from "@/components/auth/auth-frame";
import { completeGoogleRedirect, signInWithGoogle, signOutFirebase, watchFirebaseUser } from "@/lib/auth/firebase-session";
import { isFirebaseConfigured } from "@/lib/firebase/config";
import { isSharedTestEnvironment } from "@/lib/cloud/config";
import { firebaseLoginDestination } from "@/lib/auth/firebase-login-destination";

export function FirebaseAuthPage() {
  const router = useRouter();
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const loginInProgress = useRef(false);

  const openRecords = useCallback(async (user: User) => {
    router.replace(await firebaseLoginDestination(user));
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
          void openRecords(user)
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
      if (user) await openRecords(user);
    } catch (reason) {
      setBusy(false);
      setError(reason instanceof Error ? reason.message : "Googleログインを完了できませんでした。");
    } finally {
      loginInProgress.current = false;
    }
  }

  return <AuthFrame
    title="ログイン"
    description="初めての方も、Googleで登録できます。"
    footer={<Link href="/bodymake" className="text-link">トップへ戻る</Link>}
  >
    <div className="space-y-5">
      {isFirebaseConfigured ? <>
        <label className="flex min-h-11 items-center gap-3 text-sm text-[var(--ink-soft)]"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} className="size-4 shrink-0 accent-[var(--sage-deep)]" />ログイン状態を記憶する</label>
        <Button type="button" variant="secondary" className="w-full gap-3" disabled={busy || checking} onClick={() => void login()}><GoogleMark />{busy || checking ? "確認中…" : "Googleで続ける"}</Button>
      </> : <p role="alert" className="rounded-md bg-[var(--coral-soft)] p-4 text-sm leading-6 text-[var(--coral)]">Firebaseの接続設定が未完了です。利用開始前に管理者が設定してください。</p>}
      {error && <div>
        <p role="alert" className="break-words rounded-md bg-[var(--coral-soft)] p-3 text-sm text-[var(--coral)]">{error}</p>
        {isSharedTestEnvironment && <Button type="button" variant="secondary" className="mt-3 w-full" disabled={busy} onClick={() => void signOutFirebase().then(() => setError("")).catch(() => setError("ログアウトできませんでした。通信を確認してください。"))}>ログアウトして別のGoogleアカウントを使う</Button>}
      </div>}
      <StorageNote>記録はアカウントに保存します。身体写真はこの端末だけに保存されます。</StorageNote>
    </div>
  </AuthFrame>;
}
