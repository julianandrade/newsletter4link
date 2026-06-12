import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle (.next/standalone) for the Docker/Cloud Run image.
  // Harmless on Vercel (ignored by the Vercel build pipeline).
  output: "standalone",
};

export default nextConfig;
