import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  root: resolve(import.meta.dirname),
  define: {
    __VUE_OPTIONS_API__: true,
    __VUE_PROD_DEVTOOLS__: false,
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
  },
  resolve: {
    alias: {
      "@guard": resolve(import.meta.dirname, "../../../src/index.ts"),
    },
  },
  server: {
    fs: { allow: [resolve(import.meta.dirname, "../../..")] },
  },
});
