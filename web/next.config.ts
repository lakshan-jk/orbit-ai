import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Proxy: browser calls /api/* on :3000, Next forwards to FastAPI on :8100.
  // This sidesteps CORS entirely — the browser only ever talks to its own origin.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:8100/:path*",
      },
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
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
