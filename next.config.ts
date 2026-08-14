import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * `output: "standalone"` emits a self-contained server bundle at `.next/standalone`,
   * which is what the Dockerfile's runner stage copies. Without it that COPY has no
   * source and the image build fails.
   *
   * It is behind a flag rather than set unconditionally. The archived migration branch
   * set it outright on the grounds that Vercel ignores it, and Next's own documentation
   * agrees it is "not needed" there, but not needed is not the same as inert. This
   * repository has twice had a Vercel build break for reasons no local build reproduced,
   * once in `next/font/google` and once on an environment variable, and both times the
   * symptom was a deployment that never shipped rather than an error anyone saw. The
   * migration is not supposed to be able to touch the live site at all, so the Vercel
   * build path stays byte-for-byte what it is today and the Docker build opts in.
   *
   * The Dockerfile's build stage sets it, so `docker build` needs no extra argument.
   */
  ...(process.env.BUILD_STANDALONE === "1" ? { output: "standalone" as const } : {}),
};

export default nextConfig;
