import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit reads its font metrics from disk at runtime, so it isn't bundled.
  serverExternalPackages: ["pdfkit"],
  // Make sure pdfkit's font files are deployed with the export route (Vercel).
  outputFileTracingIncludes: {
    "/api/cvs/[id]/export": ["./node_modules/pdfkit/js/data/**"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
