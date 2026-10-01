import type { Metadata } from "next";
import { DashboardContent } from "@/components/dashboard/dashboard-content";
import { AppShell } from "@/components/layout/app-shell";

export const metadata: Metadata = { title: "ホーム | BodyMake" };

export default function DashboardPage() { return <AppShell><DashboardContent /></AppShell>; }
