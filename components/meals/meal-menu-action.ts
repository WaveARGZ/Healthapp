import type { ReactNode } from "react";
import type { MealFoodItem } from "@/types/meal";

export type RenderMealMenuStar = (placement: string, food: Omit<MealFoodItem, "id"> | null) => ReactNode;
