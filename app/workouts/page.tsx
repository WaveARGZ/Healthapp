import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { WorkoutRecorder } from "@/components/workouts/workout-recorder";

export const metadata: Metadata = { title: "筋トレ記録 | BodyMake" };

export default function WorkoutsPage() { return <AppShell><WorkoutRecorder /></AppShell>; }
