const SENTINEL_KEY = "__revfanc_guard__";
const INVALID_STATE =
  "@revfanc/guard: history.state must be null or a plain object.";
const SENTINEL_REPLACED =
  "@revfanc/guard: the history sentinel was replaced.";
const SENTINEL_NOT_EDITABLE =
  "@revfanc/guard: the history sentinel is not editable.";

type HistoryState = null | Record<string, unknown>;
type SentinelState = Record<string, unknown>;

export interface HistorySentinel {
  isCurrent(): boolean;
  isAtBase(): boolean;
  restoreAtBase(): void;
  releaseToBase(): void;
}

export interface HistoryPort {
  createSentinel(): HistorySentinel;
  listenToPopState(listener: (intercept: () => void) => void): void;
  back(): void;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isHistoryState(value: unknown): value is HistoryState {
  return value === null || isPlainRecord(value);
}

function assertHistoryState(value: unknown): asserts value is HistoryState {
  if (!isHistoryState(value)) throw new TypeError(INVALID_STATE);
}

function hasSentinelMarker(state: HistoryState): state is SentinelState {
  return (
    state !== null &&
    Object.prototype.hasOwnProperty.call(state, SENTINEL_KEY)
  );
}

function isBaseState(value: unknown): value is HistoryState {
  return isHistoryState(value) && !hasSentinelMarker(value);
}

function createHistorySentinel(target: Window): HistorySentinel {
  const { history, location } = target;
  const url = location.href;
  const isSameUrl = (): boolean => location.href === url;

  const pushSentinel = (state: HistoryState): void => {
    let editable = state;
    if (editable !== null && !Object.isExtensible(editable)) {
      history.replaceState(editable, "", url);
      const current: unknown = history.state;
      assertHistoryState(current);
      editable = current;
    }

    const sentinelState = editable ?? {};
    Object.defineProperty(sentinelState, SENTINEL_KEY, {
      configurable: true,
      enumerable: true,
      value: state === null,
      writable: true,
    });
    try {
      history.pushState(sentinelState, "", url);
    } finally {
      if (editable !== null) delete sentinelState[SENTINEL_KEY];
    }
  };

  const readBaseState = (): HistoryState | undefined => {
    if (!isSameUrl()) return undefined;
    const state: unknown = history.state;
    return isBaseState(state) ? state : undefined;
  };

  const readSentinelState = (): SentinelState | undefined => {
    if (!isSameUrl()) return undefined;
    const state: unknown = history.state;
    return isHistoryState(state) && hasSentinelMarker(state)
      ? state
      : undefined;
  };

  const initialState: unknown = history.state;
  assertHistoryState(initialState);
  if (!hasSentinelMarker(initialState)) pushSentinel(initialState);

  return {
    isCurrent: () => readSentinelState() !== undefined,
    isAtBase: () => readBaseState() !== undefined,
    restoreAtBase(): void {
      const state = readBaseState();
      if (state === undefined) throw new Error(SENTINEL_REPLACED);
      pushSentinel(state);
    },
    releaseToBase(): void {
      let state = readSentinelState();
      if (state === undefined) throw new Error(SENTINEL_REPLACED);
      const startedFromNull = state[SENTINEL_KEY] === true;

      const marker = Object.getOwnPropertyDescriptor(state, SENTINEL_KEY);
      if (!Object.isExtensible(state) || !marker?.configurable) {
        history.replaceState(state, "", url);
        state = readSentinelState();
        if (state === undefined) throw new Error(SENTINEL_REPLACED);
      }

      const editableMarker = Object.getOwnPropertyDescriptor(
        state,
        SENTINEL_KEY,
      );
      if (!editableMarker?.configurable || !delete state[SENTINEL_KEY]) {
        throw new Error(SENTINEL_NOT_EDITABLE);
      }

      const base =
        startedFromNull && Reflect.ownKeys(state).length === 0 ? null : state;
      try {
        history.replaceState(base, "", url);
      } catch (error) {
        Object.defineProperty(state, SENTINEL_KEY, editableMarker);
        throw error;
      }
      history.back();
    },
  };
}

export function createHistoryPort(target: Window): HistoryPort {
  return {
    createSentinel: () => createHistorySentinel(target),
    listenToPopState(listener): void {
      target.addEventListener(
        "popstate",
        event => {
          listener(() => event.stopImmediatePropagation());
        },
        true,
      );
    },
    back: () => target.history.back(),
  };
}
