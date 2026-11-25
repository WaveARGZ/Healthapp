import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { WorkoutTimerProvider } from "@/components/workouts/workout-timer";

export default function RecordsLayout({ children }: { children: ReactNode }) {
  return <WorkoutTimerProvider><AppShell>{children}</AppShell></WorkoutTimerProvider>;
}
