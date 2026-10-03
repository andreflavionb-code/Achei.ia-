import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright abre um navegador real; não pode ser empacotado pelo bundler.
  serverExternalPackages: ["playwright", "playwright-core"],
};

export default nextConfig;
