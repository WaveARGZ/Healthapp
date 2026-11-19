import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";

export default function RecordsLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
