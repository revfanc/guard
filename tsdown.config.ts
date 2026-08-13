import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  target: "es2015",
  platform: "browser",
  dts: {
    sourcemap: false,
  },
  sourcemap: true,
  clean: true,
  treeshake: true,
  failOnWarn: true,
  tsconfig: "tsconfig.build.json",
  outExtensions({ format }) {
    if (format === "es") {
      return { js: ".js", dts: ".d.mts" };
    }

    return { js: ".cjs", dts: ".d.cts" };
  },
});
