import type { NextConfig } from "next";

// `standalone` is opt-in via NEXT_OUTPUT=standalone (set in Dockerfile).
// Building it on Windows + pnpm fails because Next can't recreate the
// symlinked .pnpm tree without dev-mode privileges.
const nextConfig: NextConfig = {
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  // PGlite ships its own WASM + filesystem-loader; drizzle-orm's migrator
  // pulls in node:fs / node:path / node:crypto which webpack can't bundle
  // (Turbopack handles them natively in dev). Externalising keeps them on
  // the runtime Node resolution path, which both standalone server.js and
  // request handlers can resolve from node_modules.
  serverExternalPackages: ["@electric-sql/pglite", "drizzle-orm", "pg"],
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
