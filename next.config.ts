import type { NextConfig } from "next";
import path from "node:path";
import { getDeploymentBasePath } from "./lib/deployment-base-path.mjs";

const basePath = getDeploymentBasePath();
const isTestEnvironment = process.env.NEXT_PUBLIC_BODYMAKE_ENV === "test";
if (process.env.NEXT_PUBLIC_BODYMAKE_SHARED_TEST === "true" && !isTestEnvironment) {
  throw new Error("共有テスト環境には NEXT_PUBLIC_BODYMAKE_ENV=test が必要です。");
}

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
