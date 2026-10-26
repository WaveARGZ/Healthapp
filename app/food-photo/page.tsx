import type { Metadata } from "next";
import { PublicFoodPhoto } from "@/components/meals/public-food-photo";
import { isTestEnvironment } from "@/lib/cloud/config";
import { getDeploymentBasePath } from "@/lib/deployment-base-path.mjs";

export const metadata: Metadata = {
  title: isTestEnvironment ? "食事写真AIを試す | BodyMake テスト" : "食事写真AIを試す | BodyMake",
  description: "食事写真から料理の候補を確認。任意の同意とGoogle認証で、正解をBodyMakeの学習用データへ共有できます。",
  manifest: `${getDeploymentBasePath()}/food-photo.webmanifest`,
  appleWebApp: { capable: true, title: isTestEnvironment ? "食事写真 テスト" : "食事写真" },
};

export default function FoodPhotoPage() {
  return <PublicFoodPhoto />;
}
