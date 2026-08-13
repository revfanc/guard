import { createGuard } from "./runtime";
import type { BackGuard, BackGuardOptions } from "./types";

export type { BackAttempt, BackGuard, BackGuardOptions } from "./types";

function browserWindow(): Window | undefined {
  return typeof window === "undefined" ? undefined : window;
}

export function isBackGuardSupported(): boolean {
  const target = browserWindow();
  return !!target &&
    typeof target.addEventListener === "function" &&
    typeof target.history?.pushState === "function" &&
    typeof target.history.replaceState === "function" &&
    typeof target.history.back === "function";
}

export function createBackGuard(options: BackGuardOptions): BackGuard {
  if (!options || typeof options.onBack !== "function") {
    throw new TypeError("@revfanc/guard: options.onBack must be a function.");
  }
  if (options.onError !== undefined && typeof options.onError !== "function") {
    throw new TypeError("@revfanc/guard: options.onError must be a function.");
  }

  const target = browserWindow();
  if (!target || !isBackGuardSupported()) {
    throw new Error(
      "@revfanc/guard: createBackGuard() requires a browser with the History API.",
    );
  }

  return createGuard(target, options);
}
