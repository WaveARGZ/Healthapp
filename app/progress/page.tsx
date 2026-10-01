import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { ProgressOverview } from "@/components/progress/progress-overview";

export const metadata: Metadata = { title: "進捗 | BodyMake" };

export default function ProgressPage() { return <AppShell><ProgressOverview /></AppShell>; }
