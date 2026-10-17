import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
const base = "/moments-publisher/";

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      scope: base,
      injectRegister: "auto",
      manifest: {
        name: "拾光 · 朋友圈商品助手",
        short_name: "拾光",
        description: "本地保存商品，轻松准备朋友圈",
        lang: "zh-CN",
        id: base,
        start_url: base,
        scope: base,
        display: "standalone",
        background_color: "#f6f5f0",
        theme_color: "#243c34",
        icons: [
          {
            src: `${base}icons/icon-192.png`,
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: `${base}icons/icon-512.png`,
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,ico}"],
        navigateFallback: `${base}index.html`,
      },
    }),
  ],
});
