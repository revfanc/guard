import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const manifest = JSON.parse(
  execFileSync(
    "pnpm",
    ["pack", "--dry-run", "--json", "--config.ignore-scripts=true"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      shell: process.platform === "win32",
    },
  ),
);

const expectedFiles = [
  "LICENSE",
  "README.md",
  "dist/index.cjs",
  "dist/index.cjs.map",
  "dist/index.d.cts",
  "dist/index.d.mts",
  "dist/index.js",
  "dist/index.js.map",
  "package.json",
];
const files = manifest.files.map(({ path }) => path).sort();
assert.deepStrictEqual(files, expectedFiles, "Unexpected packed files.");

const esm = readFileSync("dist/index.js", "utf8");
for (const name of [
  "Reflect.",
  "Symbol",
  "Object.getOwnPropertySymbols",
  "Object.getOwnPropertyDescriptors",
  "Object.defineProperties",
]) {
  assert.ok(!esm.includes(name), `ESM bundle uses ${name}.`);
}

assert.deepStrictEqual(
  {
    main: packageJson.main,
    module: packageJson.module,
    types: packageJson.types,
    exports: packageJson.exports,
  },
  {
    main: "./dist/index.cjs",
    module: "./dist/index.js",
    types: "./dist/index.d.mts",
    exports: {
      ".": {
        import: {
          types: "./dist/index.d.mts",
          default: "./dist/index.js",
        },
        require: {
          types: "./dist/index.d.cts",
          default: "./dist/index.cjs",
        },
      },
    },
  },
  "Package entrypoints changed.",
);

const entries = {
  ESM: await import(new URL("../dist/index.js", import.meta.url)),
  CJS: createRequire(import.meta.url)("../dist/index.cjs"),
};
for (const [format, entry] of Object.entries(entries)) {
  assert.deepStrictEqual(
    Object.keys(entry).sort(),
    ["createGuard"],
    `${format} runtime exports changed.`,
  );
  assert.strictEqual(
    typeof entry.createGuard,
    "function",
    `${format} createGuard is not a function.`,
  );
}

console.log(`Package content verified (${files.length} files).`);
