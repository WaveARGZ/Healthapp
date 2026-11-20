import type { Metadata } from "next";
import { WeightRecorder } from "@/components/progress/weight-recorder";

export const metadata: Metadata = { title: "体重記録 | BodyMake" };

export default function WeightPage() { return <WeightRecorder />; }
