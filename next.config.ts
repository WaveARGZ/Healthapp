import type { NextConfig } from "next";
import path from "node:path";

const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "Healthapp";
const isGitHubPagesBuild = process.env.GITHUB_ACTIONS === "true";
const basePath = isGitHubPagesBuild ? `/${repositoryName}` : "";

const nextConfig: NextConfig = {
  // GitHub Pages is served under /<repository>/, whereas local development uses /.
  output: "export",
  trailingSlash: true,
  basePath,
  assetPrefix: basePath ? `${basePath}/` : undefined,
  images: {
    unoptimized: true,
  },
  // Keep Turbopack inside this repository even when a parent folder has a lockfile.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
