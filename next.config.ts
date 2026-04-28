import type { NextConfig } from "next";

// `standalone` is opt-in via NEXT_OUTPUT=standalone (set in Dockerfile).
// Building it on Windows + pnpm fails because Next can't recreate the
// symlinked .pnpm tree without dev-mode privileges.
const nextConfig: NextConfig = {
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
