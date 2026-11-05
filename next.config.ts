import type { NextConfig } from "next";

// long-lived caching for the heavy static assets (they only change with a new file name)
const immutable = [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/models/:path*", headers: immutable },
      { source: "/textures/:path*", headers: immutable },
    ];
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
