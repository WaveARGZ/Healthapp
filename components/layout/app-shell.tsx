import type { ReactNode } from "react";
import { BottomNav } from "@/components/layout/bottom-nav";
import { AppTopBar } from "@/components/ui/page-header";
import { MobileViewport } from "@/components/layout/mobile-viewport";

export function AppShell({ children, recording = false }: { children: ReactNode; recording?: boolean }) {
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
