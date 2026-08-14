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
  back(): void;
  report(error: unknown): void;
}

let sequence = 0;

function createId(): string {
  return `${Date.now().toString(36)}-${(++sequence).toString(36)}-${
    Math.random().toString(36).slice(2) || "0"
  }`;
}

function ownMarker(
  value: object,
  key = KEY,
): PropertyDescriptor | undefined {
  return Object.getOwnPropertyDescriptor(value, key);
}

function plain(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function clean(value: unknown, key: string): value is Root {
  return (
    value === null ||
    (plain(value) && Object.isExtensible(value) && !ownMarker(value, key))
  );
}

function assertRoot(value: unknown): asserts value is Root {
  if (value === null) return;
  if (!plain(value)) throw new TypeError(INVALID_STATE);
  if (!Object.isExtensible(value)) {
    throw new TypeError("@revfanc/guard: history.state must be extensible.");
  }
}

function readMarker(
  value: Record<string, unknown>,
  key: string,
): { encoded: string; id: string; key: string } | undefined {
  const descriptor = ownMarker(value, key);
  if (!descriptor?.configurable || typeof descriptor.value !== "string") {
    return undefined;
  }
  const match = /^1:[no]:([a-z0-9]+-[a-z0-9]+-[a-z0-9]+)$/.exec(
    descriptor.value,
  );
  const id = match?.[1];
  if (!id || (key !== KEY && key !== `${KEY}:${id}`)) return undefined;
  return { encoded: descriptor.value, id, key };
}

function existingMarker(
  value: unknown,
): { encoded: string; id: string; key: string } | undefined {
  if (!plain(value) || !Object.isExtensible(value)) return undefined;
  for (const key of Object.getOwnPropertyNames(value)) {
    if (key.startsWith(`${KEY}:`)) {
      const marker = readMarker(value, key);
      if (marker) return marker;
    }
  }
  return readMarker(value, KEY);
}

function writeMarked(
  history: History,
  method: "pushState" | "replaceState",
  state: Root,
  key: string,
  encoded: string,
  url: string,
): void {
  const value = state ?? {};
  Object.defineProperty(value, key, {
    configurable: true,
    enumerable: true,
    value: encoded,
    writable: true,
  });
  try {
    history[method](value, "", url);
  } finally {
    if (state) delete state[key];
  }
}

function makeSentinel(target: Window): Sentinel {
  const state: unknown = target.history.state;
  const existing = existingMarker(state);
  assertRoot(state);
  let id = existing?.id ?? createId();
  let key = existing?.key ?? KEY;
  while (!existing && state !== null && ownMarker(state, key)) {
    id = createId();
    key = `${KEY}:${id}`;
  }
  const url = target.location.href;
  let encoded = existing?.encoded ?? `1:${state === null ? "n" : "o"}:${id}`;
  if (!existing) {
    writeMarked(target.history, "pushState", state, key, encoded, url);
  }
  const { history, location } = target;
  const sameUrl = (): boolean => location.href === url;
  const matches = (state: unknown): boolean =>
    plain(state) && ownMarker(state, key)?.value === encoded;
  const isAtBase = (state: unknown): boolean =>
    sameUrl() && clean(state, key) && clean(history.state, key);

  return {
    matches,
    isCurrent: () => sameUrl() && matches(history.state),
    isAtBase,
    restore(state): void {
      if (!isAtBase(state)) throw new Error(REPLACED);
      const current: unknown = history.state;
      assertRoot(current);
      const next = `1:${current === null ? "n" : "o"}:${id}`;
      writeMarked(history, "pushState", current, key, next, url);
      encoded = next;
    },
    release(): void {
      const state: unknown = history.state;
      if (!sameUrl() || !plain(state)) throw new Error(REPLACED);
      const descriptor = ownMarker(state, key);
      if (descriptor?.value !== encoded) throw new Error(REPLACED);
      if (!Object.isExtensible(state)) {
        throw new Error(NOT_EDITABLE);
      }

      if (!descriptor.configurable || !delete state[key]) {
        throw new Error(NOT_EDITABLE);
      }
      const base =
        encoded.startsWith("1:n:") && Reflect.ownKeys(state).length === 0
          ? null
          : state;
      try {
        history.replaceState(base, "", url);
      } catch (error) {
        Object.defineProperty(state, key, descriptor);
        throw error;
      }

      const cleared: unknown = history.state;
      try {
        history.back();
      } catch (error) {
        if (sameUrl() && history.state === cleared && clean(cleared, key)) {
          try {
            writeMarked(history, "replaceState", cleared, key, encoded, url);
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
    back: () => target.history.back(),
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
