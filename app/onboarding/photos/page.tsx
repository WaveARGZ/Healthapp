import type { Metadata } from "next";
import { OnboardingPhotoStep } from "@/components/profile/onboarding-photo-step";

export const metadata: Metadata = { title: "理想の身体を作る | BodyMake" };

export default function OnboardingPhotosPage() {
  return <OnboardingPhotoStep />;
}
