"use client";

import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { BottomNav } from "@/components/layout/bottom-nav";
import { AppTopBar } from "@/components/ui/page-header";
import { MobileViewport } from "@/components/layout/mobile-viewport";
import { Logo } from "@/components/ui/logo";
import { hasCloudSession } from "@/lib/auth/cognito-session";
import { isCloudConfigured } from "@/lib/cloud/config";

export function AppShell({ children, recording = false }: { children: ReactNode; recording?: boolean }) {
  const router = useRouter();
  const ready = useSyncExternalStore(() => () => {}, () => !isCloudConfigured || hasCloudSession(), () => !isCloudConfigured);
  useEffect(() => {
    if (!isCloudConfigured) return;
    if (!hasCloudSession()) router.replace("/login");
  }, [router]);
  if (!ready) return <main className="setup-page"><div className="setup-content"><Logo /><h1 className="setup-title mt-8">ログイン確認</h1><p className="mt-4 text-sm text-[var(--muted)]">ログイン状態を確認しています…</p></div></main>;
  return (
    <MobileViewport>
      <a href="#main-content" className="sr-only z-50 bg-white p-3 focus:not-sr-only focus:fixed">本文へ移動</a>
      <AppTopBar />
      <div className="mx-auto max-w-6xl lg:grid lg:grid-cols-[180px_minmax(0,1fr)] lg:gap-12 lg:px-8">
        <BottomNav />
        <main id="main-content" data-recording={recording} className="app-content mx-auto w-full min-w-0 max-w-[760px]">{children}</main>
      </div>
    </MobileViewport>
  );
}
