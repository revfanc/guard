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
      .flatMap((item) => (item.type === "chunk" ? [item.code] : []))
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
  throw new Error(
    `Tree-shaking retained a side-effect-only import:\n${sideEffectBundle}`,
  );
}

const createBundle = await bundleEntry("scripts/tree-shaking/create.mjs");

if (!createBundle.includes("__revfanc_guard__")) {
  throw new Error(
    "Tree-shaking lost createGuard from the usage bundle.",
  );
}
console.log("Tree-shaking verified (side-effect-free and create bundles).");
