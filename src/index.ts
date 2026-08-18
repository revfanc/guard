import { add } from "./runtime";
import type { Guard, Handler } from "./types";

const HANDLER = "@revfanc/guard: handler must be a function.";
const TARGET =
  "@revfanc/guard: target must be a same-origin Window with the History API.";

export type { Guard, Handler } from "./types";

function current(target?: Window): Window {
  const value =
    target ?? (typeof window === "undefined" ? undefined : window);
  try {
    if (
      !value ||
      typeof value.addEventListener !== "function" ||
      typeof value.setTimeout !== "function" ||
      typeof value.history?.back !== "function" ||
      typeof value.history.pushState !== "function" ||
      typeof value.history.replaceState !== "function" ||
      typeof value.location?.href !== "string"
    ) {
      throw new TypeError(TARGET);
    }
  } catch {
    throw new TypeError(TARGET);
  }
  return value;
}

export function createGuard(handler: Handler, target?: Window): Guard {
  if (typeof handler !== "function") throw new TypeError(HANDLER);
  return add(current(target), handler);
}
