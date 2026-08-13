import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const tag = process.env.GITHUB_REF_NAME;

if (!tag || tag !== `v${packageJson.version}`) {
  console.error(`Tag ${tag ?? "<missing>"} does not match package version v${packageJson.version}.`);
  process.exit(1);
}

console.log(`${tag} matches package.json.`);
