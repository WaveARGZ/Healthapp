import type { Metadata } from "next";
import { SettingsList } from "@/components/settings/settings-list";

export const metadata: Metadata = { title: "設定 | BodyMake" };

export default function SettingsPage() { return <SettingsList />; }
