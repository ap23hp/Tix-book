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
    // .trim() removes stray spaces or newlines copied into the env var
    const apiUrl = (
      process.env.API_URL ?? "https://tixbook-api.onrender.com"
    ).trim();

    // Fail with a clear message instead of Next's "Invalid rewrite"
    if (!/^https?:\/\//.test(apiUrl)) {
      throw new Error("API_URL must start with http:// or https://");
    }

    return [
      {
        // Browser calls vercel.app/api/..., Vercel forwards it to Render.
        // The browser only ever talks to vercel.app, so auth cookies stay first-party.
        // Locally API_URL is http://localhost:4000, so local log-ins hit your local API.
        source: "/api/:path*",
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
