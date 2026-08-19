import { start } from "./guard";
import type { Guard, Handler } from "./types";

const HANDLER = "@revfanc/guard: handler must be a function.";
const BROWSER = "@revfanc/guard: browser History API is unavailable.";

export type { Guard, Handler } from "./types";

function browser(): Window {
  const value = typeof window === "undefined" ? undefined : window;
  try {
    if (
      !value ||
      typeof value.addEventListener !== "function" ||
      typeof value.removeEventListener !== "function" ||
      typeof value.setTimeout !== "function" ||
      typeof value.history?.back !== "function" ||
      typeof value.history.pushState !== "function" ||
      typeof value.history.replaceState !== "function" ||
      typeof value.location?.href !== "string"
    ) {
      throw new TypeError(BROWSER);
    }
  } catch {
    throw new TypeError(BROWSER);
  }
  return value;
}

export function createGuard(handler: Handler): Guard {
  if (typeof handler !== "function") throw new TypeError(HANDLER);
  return start(browser(), handler);
}
