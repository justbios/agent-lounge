import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project (a stray lockfile lives in $HOME).
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
