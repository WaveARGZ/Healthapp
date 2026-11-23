"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { BottomNav } from "@/components/layout/bottom-nav";
import { AppTopBar } from "@/components/ui/page-header";
import { MobileViewport } from "@/components/layout/mobile-viewport";
import { Logo } from "@/components/ui/logo";
import { hasCloudSession } from "@/lib/auth/cognito-session";
import { isCloudConfigured } from "@/lib/cloud/config";
import { isFirebaseConfigured, isFirebaseSelected } from "@/lib/firebase/config";
import { watchFirebaseUser } from "@/lib/auth/firebase-session";
import { firebaseLoginDestination } from "@/lib/auth/firebase-login-destination";
import { profileSetupPath, type ProfileDestination } from "@/lib/auth/profile-destination";

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname().replace(/\/$/, "");
  const recording = ["/workouts", "/meals", "/weight"].includes(pathname);
  const [firebaseStatus, setFirebaseStatus] = useState<"checking" | "denied" | ProfileDestination>(isFirebaseConfigured ? "checking" : "denied");
  const [tabVisits, setTabVisits] = useState<Record<string, number>>({});
  const pendingTab = useRef<string | null>(null);
  const tabVisit = tabVisits[pathname] ?? 0;
  const ready = useSyncExternalStore(() => () => {}, () => isFirebaseSelected || !isCloudConfigured || hasCloudSession(), () => !isCloudConfigured);
  const recordsReady = ready && (!isFirebaseSelected || firebaseStatus === "/dashboard");

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
      void firebaseLoginDestination(user).then((destination) => {
        if (active && generation === current) setFirebaseStatus(destination);
      }).catch(() => {
        if (active && generation === current) setFirebaseStatus("denied");
      });
    });
    return () => { active = false; unsubscribe(); };
  }, []);

  useEffect(() => {
    if (isFirebaseSelected && firebaseStatus === profileSetupPath) router.replace(profileSetupPath);
    else if (isFirebaseSelected ? firebaseStatus === "denied" : !ready) router.replace("/login");
  }, [firebaseStatus, ready, router]);

  function openTab(href: string) {
    pendingTab.current = href;
    setTabVisits((current) => ({ ...current, [href]: (current[href] ?? 0) + 1 }));
  }

  useLayoutEffect(() => {
    if (!recordsReady || pendingTab.current !== pathname) return;
    pendingTab.current = null;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname, recordsReady, tabVisit]);

  if (!recordsReady) return <main className="setup-page"><div className="setup-content"><Logo /><h1 className="setup-title mt-8">ログイン確認</h1><p className="mt-4 text-sm text-[var(--muted)]">ログイン状態を確認しています…</p></div></main>;
  return (
    <MobileViewport>
      <a href="#main-content" className="sr-only z-50 bg-white p-3 focus:not-sr-only focus:fixed">本文へ移動</a>
      <AppTopBar showWeeklyReview={pathname !== "/weekly-review"} />
      <div className="mx-auto max-w-7xl lg:grid lg:grid-cols-[190px_minmax(0,1fr)] lg:gap-8 lg:px-10 xl:grid-cols-[210px_minmax(0,1fr)] xl:gap-12">
        <BottomNav onOpenTab={openTab} />
        <main key={`${pathname}:${tabVisit}`} id="main-content" data-recording={recording} className="app-content mx-auto w-full min-w-0 max-w-[940px]">{children}</main>
      </div>
    </MobileViewport>
  );
}
