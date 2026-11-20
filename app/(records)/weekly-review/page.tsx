import type { Metadata } from "next";
import Link from "next/link";
import { DashboardContent } from "@/components/dashboard/dashboard-content";

export const metadata: Metadata = { title: "1週間のふり返り | BodyMake" };

export default function WeeklyReviewPage() {
  return <>
    <Link href="/dashboard" className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--sage-deep)] hover:underline">← ホームに戻る</Link>
    <DashboardContent view="weekly-review" />
  </>;
}
