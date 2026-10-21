import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:5080" },
  },
  build: {
    // Üretim çıktısı doğrudan API'nin wwwroot klasörüne gider, tek sunucudan servis edilir.
    outDir: "../backend/src/StokYonetimi.Api/wwwroot",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: { react: ["react", "react-dom", "react-router-dom", "@tanstack/react-query"], charts: ["recharts"] },
      },
    },
  },
});
