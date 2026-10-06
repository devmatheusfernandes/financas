import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // App 100% autenticado e dinâmico: sem Cache Components por enquanto.
  cacheComponents: false,
  serverExternalPackages: ["exceljs"],
  // Mantém pendente (em vez de dar erro) a navegação e as Server Actions quando a rede
  // cai, e repete sozinho quando ela volta. Também libera o hook useOffline.
  experimental: { useOffline: true },
  async headers() {
    return [
      {
        // o service worker nunca pode ficar preso no cache do navegador
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
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
