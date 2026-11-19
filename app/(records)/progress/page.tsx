import type { Metadata } from "next";
import { ProgressOverview } from "@/components/progress/progress-overview";

export const metadata: Metadata = { title: "進捗 | BodyMake" };

export default function ProgressPage() { return <ProgressOverview />; }
