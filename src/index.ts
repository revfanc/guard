import { createGuard } from "./runtime";
import type { BackGuard, BackGuardOptions } from "./types";

export type {
  BackAction,
  BackAttempt,
  BackGuard,
  BackGuardOptions,
  BackResolution,
} from "./types";

export function createBackGuard(options: BackGuardOptions): BackGuard {
  if (!options || typeof options.onBack !== "function") {
    throw new TypeError("@revfanc/guard: options.onBack must be a function.");
  }
  if (options.onError !== undefined && typeof options.onError !== "function") {
    throw new TypeError("@revfanc/guard: options.onError must be a function.");
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

  return createGuard(target, options);
}
