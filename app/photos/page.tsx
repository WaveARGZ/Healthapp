import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { PhotoRecorder } from "@/components/photos/photo-recorder";

export const metadata: Metadata = { title: "身体写真 | BodyMake" };

export default function PhotosPage() { return <AppShell><PhotoRecorder /></AppShell>; }
