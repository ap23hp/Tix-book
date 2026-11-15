import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
  async rewrites() {
    return [
      {
        // Browser calls vercel.app/api/..., Vercel forwards it to Render.
        // The browser only ever talks to vercel.app, so auth cookies stay first-party.
        source: "/api/:path*",
        destination: "https://tixbook-api.onrender.com/api/:path*",
      },
    ];
  },
};

export default nextConfig;
