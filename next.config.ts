import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Keep Turbopack inside this repository even when a parent folder has a lockfile.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
