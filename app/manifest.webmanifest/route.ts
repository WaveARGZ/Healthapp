import type { MetadataRoute } from "next";
import { isFirebaseSelected } from "@/lib/firebase/config";
import { isTestEnvironment } from "@/lib/cloud/config";
import { getDeploymentBasePath } from "@/lib/deployment-base-path.mjs";

export const dynamic = "force-static";

export function GET() {
  const basePath = getDeploymentBasePath();
  const startPage = isFirebaseSelected ? "dashboard" : "bodymake";
  const manifest: MetadataRoute.Manifest = {
    name: isTestEnvironment ? "BodyMake テスト" : "BodyMake",
    short_name: isTestEnvironment ? "BodyMake テスト" : "BodyMake",
    description: "理想の身体を、見える目標に。",
    start_url: `${basePath}/${startPage}`,
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
