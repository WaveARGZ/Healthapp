import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { MealRecorder } from "@/components/meals/meal-recorder";

export const metadata: Metadata = { title: "食事記録 | BodyMake" };

export default function MealsPage() { return <AppShell><MealRecorder /></AppShell>; }
