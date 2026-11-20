"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { BottomNav } from "@/components/layout/bottom-nav";
import { AppTopBar } from "@/components/ui/page-header";
import { MobileViewport } from "@/components/layout/mobile-viewport";
import { Logo } from "@/components/ui/logo";
import { hasCloudSession } from "@/lib/auth/cognito-session";
import { isCloudConfigured } from "@/lib/cloud/config";
import { isFirebaseConfigured, isFirebaseSelected } from "@/lib/firebase/config";
import { watchFirebaseUser } from "@/lib/auth/firebase-session";
import { assertSharedTestAccess } from "@/lib/auth/shared-test-access";

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname().replace(/\/$/, "");
  const recording = ["/workouts", "/meals", "/weight"].includes(pathname);
  const [firebaseStatus, setFirebaseStatus] = useState<"checking" | "allowed" | "denied">(isFirebaseConfigured ? "checking" : "denied");
  const ready = useSyncExternalStore(() => () => {}, () => isFirebaseSelected || !isCloudConfigured || hasCloudSession(), () => !isCloudConfigured);

  useEffect(() => {
    if (!isFirebaseSelected || !isFirebaseConfigured) return;
    let active = true;
    let generation = 0;
    const unsubscribe = watchFirebaseUser((user) => {
      const current = ++generation;
      if (!user) {
        setFirebaseStatus("denied");
        return;
      }
      setFirebaseStatus("checking");
      void assertSharedTestAccess(user).then(() => {
        if (active && generation === current) setFirebaseStatus("allowed");
      }).catch(() => {
        if (active && generation === current) setFirebaseStatus("denied");
      });
    });
    return () => { active = false; unsubscribe(); };
  }, []);

  useEffect(() => {
    if (isFirebaseSelected ? firebaseStatus === "denied" : !ready) router.replace("/login");
  }, [firebaseStatus, ready, router]);

  if (!ready || (isFirebaseSelected && firebaseStatus !== "allowed")) return <main className="setup-page"><div className="setup-content"><Logo /><h1 className="setup-title mt-8">ログイン確認</h1><p className="mt-4 text-sm text-[var(--muted)]">ログイン状態を確認しています…</p></div></main>;
  return (
    <MobileViewport>
      <a href="#main-content" className="sr-only z-50 bg-white p-3 focus:not-sr-only focus:fixed">本文へ移動</a>
      <AppTopBar showWeeklyReview={pathname !== "/weekly-review"} />
      <div className="mx-auto max-w-7xl lg:grid lg:grid-cols-[190px_minmax(0,1fr)] lg:gap-8 lg:px-10 xl:grid-cols-[210px_minmax(0,1fr)] xl:gap-12">
        <BottomNav />
        <main id="main-content" data-recording={recording} className="app-content mx-auto w-full min-w-0 max-w-[940px]">{children}</main>
      </div>
    </MobileViewport>
  );
}
