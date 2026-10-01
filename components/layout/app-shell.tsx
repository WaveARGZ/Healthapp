import type { ReactNode } from "react";
import { BottomNav } from "@/components/layout/bottom-nav";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-[var(--canvas)]">
      <main className="mx-auto min-h-dvh w-full max-w-xl px-5 pb-28 pt-6 sm:px-7">{children}</main>
      <BottomNav />
    </div>
  );
}
