import type { Metadata } from "next";
import { PublicFoodPhoto } from "@/components/meals/public-food-photo";

export const metadata: Metadata = {
  title: "食事写真AIを試す | BodyMake",
  description: "食事写真から料理の候補を確認。任意の同意とGoogle認証で、正解をBodyMakeの学習用データへ共有できます。",
  manifest: `${process.env.GITHUB_ACTIONS === "true" ? `/${process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "Healthapp"}` : ""}/food-photo.webmanifest`,
  appleWebApp: { capable: true, title: "食事写真" },
};

export default function FoodPhotoPage() {
  return <PublicFoodPhoto />;
}
