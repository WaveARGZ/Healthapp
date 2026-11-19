import type { Metadata } from "next";
import { WorkoutRecorder } from "@/components/workouts/workout-recorder";

export const metadata: Metadata = { title: "筋トレ記録 | BodyMake" };

export default function WorkoutsPage() { return <WorkoutRecorder />; }
