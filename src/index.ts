import { getOrCreateManager, getWindow, prepareBackGuardRuntime } from "./manager";
import type { BackGuard, BackGuardOptions } from "./types";

export type {
  BackAttempt,
  BackAttemptSource,
  BackGuard,
  BackGuardOptions,
  BackGuardStatus,
} from "./types";

prepareBackGuardRuntime();

export function isBackGuardSupported(): boolean {
  const target = getWindow();

  if (!target) {
    return false;
  }

  return (
    typeof target.addEventListener === "function" &&
    typeof target.removeEventListener === "function" &&
    typeof target.history?.pushState === "function" &&
    typeof target.history?.back === "function"
  );
}

export function createBackGuard(options: BackGuardOptions): BackGuard {
  if (typeof options?.onBack !== "function") {
    throw new TypeError("@revfanc/guard: options.onBack must be a function.");
  }

  if (!isBackGuardSupported()) {
    throw new Error(
      "@revfanc/guard: createBackGuard() can only run in a browser with the History API.",
    );
  }

  return getOrCreateManager().add(options);
}
