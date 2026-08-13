import { execFileSync } from "node:child_process";

const output = execFileSync("pnpm", ["pack", "--dry-run", "--json"], {
  cwd: process.cwd(),
  encoding: "utf8",
  shell: process.platform === "win32",
});
const manifest = JSON.parse(output);
const files = manifest.files.map(({ path }) => path);
const allowedRootFiles = new Set(["LICENSE", "README.md", "package.json"]);
const unexpected = files.filter(
  (path) => !path.startsWith("dist/") && !allowedRootFiles.has(path),
);
const required = ["dist/index.js", "dist/index.cjs", "dist/index.d.ts"];
const missing = required.filter((path) => !files.includes(path));

if (unexpected.length > 0 || missing.length > 0) {
  console.error("Package content check failed.");
  if (unexpected.length > 0) console.error("Unexpected:", unexpected);
  if (missing.length > 0) console.error("Missing:", missing);
  process.exit(1);
}

console.log(`Package content verified (${files.length} files).`);
