import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Proxy: browser calls /api/* on :3000, Next forwards to FastAPI on :8100.
  // This sidesteps CORS entirely — the browser only ever talks to its own origin.
  async rewrites() {
    // In Docker the backend is another service (http://backend:8100); locally
    // it's on localhost. BACKEND_URL lets the same build target either.
    const backend = process.env.BACKEND_URL ?? "http://127.0.0.1:8100";
    return [
      {
        source: "/api/:path*",
        destination: `${backend}/:path*`,
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
