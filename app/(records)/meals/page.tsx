import type { Metadata } from "next";
import { MealRecorder } from "@/components/meals/meal-recorder";

export const metadata: Metadata = { title: "食事記録 | BodyMake" };

export default function MealsPage() { return <MealRecorder />; }
