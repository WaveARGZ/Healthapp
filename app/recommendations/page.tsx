import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { RecommendationPanel } from "@/components/recommendations/recommendation-panel";

export const metadata: Metadata = { title: "次の食事・筋トレ | BodyMake" };

export default function RecommendationsPage() {
  return <AppShell><RecommendationPanel /></AppShell>;
}
