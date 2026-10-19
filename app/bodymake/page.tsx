import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";

export const metadata: Metadata = {
  title: "BodyMake | 理想の身体を、見える目標に。",
  description: "筋トレ・食事・体重・身体写真を記録する、体づくり支援アプリ。",
};

export default function BodyMakeHome() {
  return <LandingPage />;
}
