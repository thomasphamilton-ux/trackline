import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" lets the build run from any folder on the IONOS server (e.g. a test subfolder).
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 1500,
  },
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/rules/**"],
  },
});
