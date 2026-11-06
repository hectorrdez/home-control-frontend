/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxyTarget = env.VITE_PROXY_TARGET || "http://localhost:3003";

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      tsconfigPaths: true,
    },
    server: {
      proxy: {
        "/api": { target: proxyTarget, changeOrigin: true },
      },
    },
    build: {
      rollupOptions: {
        output: {
          // three.js (106) ships as one named chunk, loaded only by the lazy HouseStage.
          manualChunks(id) {
            if (id.includes("/node_modules/three/")) return "three";
          },
        },
      },
    },
    test: {
      environment: "jsdom",
      include: ["src/**/*.test.{ts,tsx}"],
      coverage: {
        provider: "v8",
        include: ["src/**"],
        exclude: [
          "src/**/*.test.{ts,tsx}",
          "src/**/*.spec.{ts,tsx}",
          "src/**/*.d.ts",
          "src/types/**",
          "src/main.tsx",
        ],
        reporter: ["lcov", "text-summary"],
        reportsDirectory: "coverage",
      },
    },
  };
});
