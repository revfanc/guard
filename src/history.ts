const KEY = "__revfanc_guard__";
const INVALID_STATE =
  "@revfanc/guard: history.state must be null or an extensible plain object.";
const REPLACED = "@revfanc/guard: the history sentinel was replaced.";
const NOT_EDITABLE = "@revfanc/guard: the history sentinel is not editable.";

type Root = null | Record<string, unknown>;

export interface Sentinel {
  matches(state: unknown): boolean;
  isCurrent(): boolean;
  isAtBase(state: unknown): boolean;
  restore(state: unknown): void;
  release(): void;
}

export interface HistoryPort {
  createSentinel(): Sentinel;
  listen(listener: (state: unknown, intercept: () => void) => void): void;
  report(error: unknown): void;
}

let sequence = 0;

function ownMarker(value: object): PropertyDescriptor | undefined {
  return Object.getOwnPropertyDescriptor(value, KEY);
}

function plain(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function clean(value: unknown): value is Root {
  return (
    value === null ||
    (plain(value) && Object.isExtensible(value) && !ownMarker(value))
  );
}

function assertClean(value: unknown): asserts value is Root {
  if (value === null) return;
  if (!plain(value)) throw new TypeError(INVALID_STATE);
  if (!Object.isExtensible(value)) {
    throw new TypeError("@revfanc/guard: history.state must be extensible.");
  }
  if (ownMarker(value)) {
    throw new TypeError(`@revfanc/guard: history.state cannot contain ${KEY}.`);
  }
}

function writeMarked(
  history: History,
  method: "pushState" | "replaceState",
  state: Root,
  encoded: string,
  url: string,
): void {
  const value = state ?? {};
  Object.defineProperty(value, KEY, {
    configurable: true,
    enumerable: true,
    value: encoded,
    writable: true,
  });
  try {
    history[method](value, "", url);
  } finally {
    if (state) delete state[KEY];
  }
}

function makeSentinel(target: Window): Sentinel {
  const state: unknown = target.history.state;
  assertClean(state);
  const id = `${Date.now().toString(36)}-${(++sequence).toString(36)}-${
    Math.random().toString(36).slice(2) || "0"
  }`;
  const url = target.location.href;
  let encoded = `1:${state === null ? "n" : "o"}:${id}`;
  writeMarked(target.history, "pushState", state, encoded, url);
  const { history, location } = target;
  const sameUrl = (): boolean => location.href === url;
  const matches = (state: unknown): boolean =>
    plain(state) && ownMarker(state)?.value === encoded;
  const isAtBase = (state: unknown): boolean =>
    sameUrl() && clean(state) && clean(history.state);

  return {
    matches,
    isCurrent: () => sameUrl() && matches(history.state),
    isAtBase,
    restore(state): void {
      if (!isAtBase(state)) throw new Error(REPLACED);
      const current: unknown = history.state;
      assertClean(current);
      const next = `1:${current === null ? "n" : "o"}:${id}`;
      writeMarked(history, "pushState", current, next, url);
      encoded = next;
    },
    release(): void {
      const state: unknown = history.state;
      if (!sameUrl() || !plain(state)) throw new Error(REPLACED);
      const descriptor = ownMarker(state);
      if (descriptor?.value !== encoded) throw new Error(REPLACED);
      if (!Object.isExtensible(state)) {
        throw new Error(NOT_EDITABLE);
      }

      if (!descriptor.configurable || !delete state[KEY]) {
        throw new Error(NOT_EDITABLE);
      }
      const base =
        encoded.startsWith("1:n:") && Reflect.ownKeys(state).length === 0
          ? null
          : state;
      try {
        history.replaceState(base, "", url);
      } catch (error) {
        Object.defineProperty(state, KEY, descriptor);
        throw error;
      }

      const cleared: unknown = history.state;
      try {
        history.back();
      } catch (error) {
        if (sameUrl() && history.state === cleared && clean(cleared)) {
          try {
            writeMarked(history, "replaceState", cleared, encoded, url);
          } catch {
            // The coordinator detects failed rollback through isCurrent().
          }
        }
        throw error;
      }
    },
  };
}

export function createHistoryPort(target: Window): HistoryPort {
  return {
    createSentinel: () => makeSentinel(target),
    listen(listener): void {
      target.addEventListener(
        "popstate",
        event => {
          listener(event.state, () => event.stopImmediatePropagation());
        },
        true,
      );
    },
    report(error): void {
      const reportError = target.reportError;
      if (typeof reportError === "function") reportError.call(target, error);
      else {
        void Promise.resolve().then(() => {
          throw error;
        });
      }
    },
  };
}
