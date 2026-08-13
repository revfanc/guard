import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  root: resolve(import.meta.dirname),
  resolve: {
    alias: {
      "@guard": resolve(import.meta.dirname, "../../../src/index.ts"),
    },
  },
  server: {
    fs: { allow: [resolve(import.meta.dirname, "../../..")] },
  },
});
