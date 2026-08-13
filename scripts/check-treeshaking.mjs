import { resolve } from "node:path";
import { rolldown } from "rolldown";

async function bundleEntry(entry) {
  const build = await rolldown({
    input: resolve(entry),
    treeshake: true,
  });

  try {
    const { output } = await build.generate({ format: "esm" });
    return output
      .filter((item) => item.type === "chunk")
      .map((chunk) => chunk.code)
      .join("\n")
      .trim();
  } finally {
    await build.close();
  }
}

const sideEffectBundle = await bundleEntry(
  "scripts/tree-shaking/side-effect.mjs",
);

if (sideEffectBundle !== "") {
  console.error("Tree-shaking check failed: side-effect-only import was retained.");
  console.error(sideEffectBundle);
  process.exit(1);
}

const supportBundle = await bundleEntry("scripts/tree-shaking/support.mjs");
const forbiddenRuntimeFragments = [
  "@revfanc/guard.runtime",
  "__revfanc_guard__",
  "createBackGuard",
  "popstate",
  ".pushState(",
  ".replaceState(",
  ".back(",
  ".go(",
];
const retainedRuntimeFragments = forbiddenRuntimeFragments.filter((fragment) =>
  supportBundle.includes(fragment),
);

if (retainedRuntimeFragments.length > 0) {
  console.error(
    "Tree-shaking check failed: support-only import retained runtime code:",
    retainedRuntimeFragments,
  );
  process.exit(1);
}

if (!supportBundle.includes("function isBackGuardSupported")) {
  console.error(
    "Tree-shaking check failed: support-only import lost its public function.",
  );
  process.exit(1);
}

const createBundle = await bundleEntry("scripts/tree-shaking/create.mjs");

if (!createBundle.includes("createBackGuard")) {
  console.error(
    "Tree-shaking check failed: createBackGuard was lost from the usage bundle.",
  );
  process.exit(1);
}

console.log(
  "Tree-shaking verified (side-effect-free, support-only, and create bundles).",
);
