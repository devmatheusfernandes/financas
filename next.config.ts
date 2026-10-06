import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // App 100% autenticado e dinâmico: sem Cache Components por enquanto.
  cacheComponents: false,
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
