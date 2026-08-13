import react from "@vitejs/plugin-react";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  root: resolve(import.meta.dirname),
  plugins: [vue(), react()],
  resolve: {
    alias: {
      "@guard": resolve(import.meta.dirname, "../../../src/index.ts"),
    },
  },
  server: {
    fs: { allow: [resolve(import.meta.dirname, "../../..")] },
  },
});
