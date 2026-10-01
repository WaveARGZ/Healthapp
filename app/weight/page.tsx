import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { WeightRecorder } from "@/components/progress/weight-recorder";

export const metadata: Metadata = { title: "体重記録 | BodyMake" };

export default function WeightPage() { return <AppShell><WeightRecorder /></AppShell>; }
