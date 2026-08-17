import { createGuard } from "./runtime";
import type { BackGuard, BackHandler } from "./types";

export type {
  BackGuard,
  BackHandler,
} from "./types";

export function createBackGuard(onBack: BackHandler): BackGuard {
  if (typeof onBack !== "function") {
    throw new TypeError("@revfanc/guard: onBack must be a function.");
  }

  const target = typeof window === "undefined" ? undefined : window;
  if (
    !target ||
    typeof target.addEventListener !== "function" ||
    typeof target.history?.pushState !== "function" ||
    typeof target.history.replaceState !== "function" ||
    typeof target.history.back !== "function"
  ) {
    throw new Error(
      "@revfanc/guard: createBackGuard() requires a browser with the History API.",
    );
  }

  return createGuard(target, onBack);
}
