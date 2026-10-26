import type { MetadataRoute } from "next";
import { isTestEnvironment } from "@/lib/cloud/config";
import { getDeploymentBasePath } from "@/lib/deployment-base-path.mjs";

export const dynamic = "force-static";

export function GET() {
  const basePath = getDeploymentBasePath();
  const manifest: MetadataRoute.Manifest = {
    id: `${basePath}/food-photo/`,
    name: isTestEnvironment ? "BodyMake 食事写真 テスト" : "BodyMake 食事写真",
    short_name: isTestEnvironment ? "食事写真 テスト" : "食事写真",
    description: "食事写真から料理の候補を確認します。",
    start_url: `${basePath}/food-photo/`,
    // Keep the login callback in the installed app while always launching at food-photo.
    scope: `${basePath}/`,
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#365940",
    icons: [
      {
        src: `${basePath}/bodymake-icon-192.png`,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${basePath}/bodymake-icon-512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${basePath}/bodymake-icon-512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };

  return Response.json(manifest, {
    headers: { "Content-Type": "application/manifest+json; charset=utf-8" },
  });
}
