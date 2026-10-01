import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "Healthapp";
  const basePath = process.env.GITHUB_ACTIONS === "true" ? `/${repositoryName}` : "";

  return {
    name: "BodyMake",
    short_name: "BodyMake",
    description: "理想の身体を、見える目標に。",
    start_url: `${basePath}/`,
    display: "standalone",
    background_color: "#f8f7f3",
    theme_color: "#1f2824",
  };
}
