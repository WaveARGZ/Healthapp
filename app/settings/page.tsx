import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { SettingsList } from "@/components/settings/settings-list";

export const metadata: Metadata = { title: "設定 | BodyMake" };

export default function SettingsPage() { return <AppShell><SettingsList /></AppShell>; }
