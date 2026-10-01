import type { Metadata } from "next";
import { OnboardingForm } from "@/components/profile/onboarding-form";

export const metadata: Metadata = { title: "プロフィール設定 | BodyMake" };

export default function OnboardingPage() { return <OnboardingForm />; }
