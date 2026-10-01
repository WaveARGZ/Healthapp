import type { ReactNode } from "react";
import { BottomNav } from "@/components/layout/bottom-nav";
import { AppTopBar } from "@/components/ui/page-header";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-[var(--canvas)]">
      <a href="#main-content" className="sr-only z-50 bg-white p-3 focus:not-sr-only focus:fixed">本文へ移動</a>
      <AppTopBar />
      <div className="mx-auto max-w-6xl lg:grid lg:grid-cols-[180px_minmax(0,1fr)] lg:gap-12 lg:px-8">
        <BottomNav />
        <main id="main-content" className="mx-auto w-full min-w-0 max-w-[760px] px-5 pb-[calc(100px+env(safe-area-inset-bottom))] pt-8 sm:px-8 lg:px-0 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
