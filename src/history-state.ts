const STATE_KEY = "__revfanc_guard__";
const PACKAGE_NAME = "@revfanc/guard";
const STATE_VERSION = 1;

type StateKind = "null" | "object";

interface SentinelMarker {
  readonly package: typeof PACKAGE_NAME;
  readonly version: typeof STATE_VERSION;
  readonly id: string;
  readonly kind: StateKind;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function markerFor(id: string, kind: StateKind): SentinelMarker {
  return {
    package: PACKAGE_NAME,
    version: STATE_VERSION,
    id,
    kind,
  };
}

function defineMarker(
  state: Record<string, unknown>,
  marker: SentinelMarker,
): void {
  Object.defineProperty(state, STATE_KEY, {
    configurable: true,
    enumerable: true,
    value: marker,
    writable: true,
  });
}

export function assertSupportedState(state: unknown): asserts state is null | Record<string, unknown> {
  if (state === null) {
    return;
  }

  if (!isPlainObject(state)) {
    throw new TypeError(
      "@revfanc/guard: history.state must be null or a plain object.",
    );
  }
  if (!Object.isExtensible(state)) {
    throw new TypeError(
      "@revfanc/guard: history.state must be extensible.",
    );
  }
  if (Object.prototype.hasOwnProperty.call(state, STATE_KEY)) {
    throw new TypeError(
      `@revfanc/guard: history.state cannot contain ${STATE_KEY}.`,
    );
  }
}

export function readSentinelMarker(state: unknown): SentinelMarker | undefined {
  if (!isPlainObject(state)) {
    return undefined;
  }

  const value = state[STATE_KEY];
  if (!isPlainObject(value)) {
    return undefined;
  }
  if (
    value.package !== PACKAGE_NAME ||
    value.version !== STATE_VERSION ||
    typeof value.id !== "string" ||
    (value.kind !== "null" && value.kind !== "object")
  ) {
    return undefined;
  }

  return value as unknown as SentinelMarker;
}

export function pushSentinel(
  target: Window,
  state: unknown,
  id: string,
  url: string,
): void {
  assertSupportedState(state);
  if (state === null) {
    target.history.pushState(
      { [STATE_KEY]: markerFor(id, "null") },
      "",
      url,
    );
    return;
  }

  defineMarker(state, markerFor(id, "object"));
  try {
    target.history.pushState(state, "", url);
  } finally {
    delete state[STATE_KEY];
  }
}

export function clearCurrentSentinel(target: Window, id: string): void {
  const state: unknown = target.history.state;
  const marker = readSentinelMarker(state);
  if (!marker || marker.id !== id) {
    throw new Error("@revfanc/guard: the history sentinel was replaced.");
  }

  if (marker.kind === "null") {
    target.history.replaceState(null, "", target.location.href);
    return;
  }
  if (!isPlainObject(state) || !Object.isExtensible(state)) {
    throw new Error("@revfanc/guard: the history sentinel is not editable.");
  }

  const descriptor = Object.getOwnPropertyDescriptor(state, STATE_KEY);
  if (!descriptor || !descriptor.configurable || !delete state[STATE_KEY]) {
    throw new Error("@revfanc/guard: the history sentinel is not editable.");
  }

  try {
    target.history.replaceState(state, "", target.location.href);
  } catch (error) {
    Object.defineProperty(state, STATE_KEY, descriptor);
    throw error;
  }
}

export function isOwnSentinel(state: unknown, id: string): boolean {
  return readSentinelMarker(state)?.id === id;
}
