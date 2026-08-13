import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

const output = execFileSync(
  "pnpm",
  ["pack", "--dry-run", "--json", "--config.ignore-scripts=true"],
  {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: process.platform === "win32",
  },
);
const manifest = JSON.parse(output);
const files = manifest.files.map(({ path }) => path);
const allowedRootFiles = new Set(["LICENSE", "README.md", "package.json"]);
const unexpected = files.filter(
  (path) => !path.startsWith("dist/") && !allowedRootFiles.has(path),
);

function collectExportTargets(value, condition = "exports") {
  if (typeof value === "string") {
    return [{ condition, path: value.replace(/^\.\//, "") }];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      collectExportTargets(item, `${condition}[${index}]`),
    );
  }

  if (value === null || typeof value !== "object") {
    return [];
  }

  return Object.entries(value).flatMap(([key, item]) =>
    collectExportTargets(item, `${condition}.${key}`),
  );
}

const manifestTargets = [
  { condition: "main", path: packageJson.main },
  { condition: "module", path: packageJson.module },
  { condition: "types", path: packageJson.types },
  ...collectExportTargets(packageJson.exports),
].map(({ condition, path }) => ({
  condition,
  path: path?.replace(/^\.\//, ""),
}));

const invalidTargets = manifestTargets.filter(
  ({ path }) => typeof path !== "string" || !path.startsWith("dist/"),
);
const missingTargets = manifestTargets.filter(
  ({ path }) => typeof path === "string" && !files.includes(path),
);
const required = [
  "dist/index.js",
  "dist/index.js.map",
  "dist/index.cjs",
  "dist/index.cjs.map",
  "dist/index.d.mts",
  "dist/index.d.cts",
];
const missing = required.filter((path) => !files.includes(path));
const unexpectedBuildArtifacts = files.filter(
  (path) => path.startsWith("dist/") && !required.includes(path),
);

if (
  unexpected.length > 0 ||
  unexpectedBuildArtifacts.length > 0 ||
  invalidTargets.length > 0 ||
  missingTargets.length > 0 ||
  missing.length > 0
) {
  console.error("Package content check failed.");
  if (unexpected.length > 0) console.error("Unexpected:", unexpected);
  if (unexpectedBuildArtifacts.length > 0) {
    console.error("Unexpected build artifacts:", unexpectedBuildArtifacts);
  }
  if (invalidTargets.length > 0) {
    console.error("Invalid package targets:", invalidTargets);
  }
  if (missingTargets.length > 0) {
    console.error("Missing package targets:", missingTargets);
  }
  if (missing.length > 0) console.error("Missing build artifacts:", missing);
  process.exit(1);
}

const expectedRuntimeExports = [
  "createBackGuard",
  "isBackGuardSupported",
];
const esm = await import(new URL("../dist/index.js", import.meta.url));
const cjs = createRequire(import.meta.url)("../dist/index.cjs");
const runtimeExports = [
  ["ESM", esm],
  ["CJS", cjs],
];
const missingRuntimeExports = expectedRuntimeExports.flatMap((name) => {
  const formats = [];

  if (typeof esm[name] !== "function") formats.push("ESM");
  if (typeof cjs[name] !== "function") formats.push("CJS");

  return formats.map((format) => `${format}:${name}`);
});
const unexpectedRuntimeExports = runtimeExports.flatMap(([format, entry]) =>
  Object.keys(entry)
    .filter((name) => !expectedRuntimeExports.includes(name))
    .map((name) => `${format}:${name}`),
);

if (
  missingRuntimeExports.length > 0 ||
  unexpectedRuntimeExports.length > 0
) {
  console.error("Runtime entrypoint check failed.");
  if (missingRuntimeExports.length > 0) {
    console.error("Missing runtime exports:", missingRuntimeExports);
  }
  if (unexpectedRuntimeExports.length > 0) {
    console.error("Unexpected runtime exports:", unexpectedRuntimeExports);
  }
  process.exit(1);
}

console.log(`Package content verified (${files.length} files).`);
