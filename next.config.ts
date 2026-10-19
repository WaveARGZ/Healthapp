import type { NextConfig } from "next";
import path from "node:path";

const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "Healthapp";
const isGitHubPagesBuild = process.env.GITHUB_ACTIONS === "true";
const basePath = isGitHubPagesBuild ? `/${repositoryName}` : "";
const isTestEnvironment = process.env.NEXT_PUBLIC_BODYMAKE_ENV === "test";

const nextConfig: NextConfig = {
  // GitHub Pages is served under /<repository>/, whereas local development uses /.
  output: "export",
  // A local test server can run beside the regular app without sharing build locks.
  distDir: isTestEnvironment ? ".next-test" : ".next",
  trailingSlash: true,
  basePath,
  // basePath also prefixes bundled assets; a second prefix would duplicate slashes.
  images: {
    unoptimized: true,
  },
  // Keep Turbopack inside this repository even when a parent folder has a lockfile.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
