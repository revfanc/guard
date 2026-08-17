const KEY = "__revfanc_guard__";
const INVALID = "@revfanc/guard: history.state must be null or a plain object.";
const REPLACED = "@revfanc/guard: the history sentinel was replaced.";
const LOCKED = "@revfanc/guard: the history sentinel is not editable.";

type State = null | Record<string, unknown>;
type Marked = Record<string, unknown>;

export interface Sentinel {
  current(): boolean;
  base(): boolean;
  restore(): void;
  release(): void;
}

export interface Adapter {
  create(): Sentinel;
  listen(listener: (intercept: () => void) => void): void;
  back(): void;
}

function plain(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function valid(value: unknown): value is State {
  return value === null || plain(value);
}

function assert(value: unknown): asserts value is State {
  if (!valid(value)) throw new TypeError(INVALID);
}

function marked(value: State): value is Marked {
  return value !== null && Object.prototype.hasOwnProperty.call(value, KEY);
}

function sentinel(target: Window): Sentinel {
  const { history, location } = target;
  const url = location.href;
  const read = (): State | undefined => {
    if (location.href !== url) return undefined;
    const state: unknown = history.state;
    return valid(state) ? state : undefined;
  };
  const clean = (): State | undefined => {
    const state = read();
    return state !== undefined && !marked(state) ? state : undefined;
  };
  const marker = (): Marked | undefined => {
    const state = read();
    return state !== undefined && marked(state) ? state : undefined;
  };
  const push = (state: State): void => {
    let value = state;
    if (value !== null && !Object.isExtensible(value)) {
      history.replaceState(value, "", url);
      const current: unknown = history.state;
      assert(current);
      value = current;
    }

    const entry = value ?? {};
    Object.defineProperty(entry, KEY, {
      configurable: true,
      enumerable: true,
      value: state === null,
      writable: true,
    });
    try {
      history.pushState(entry, "", url);
    } finally {
      if (value !== null) delete entry[KEY];
    }
  };

  const initial: unknown = history.state;
  assert(initial);
  if (!marked(initial)) push(initial);

  return {
    current: () => marker() !== undefined,
    base: () => clean() !== undefined,
    restore(): void {
      const state = clean();
      if (state === undefined) throw new Error(REPLACED);
      push(state);
    },
    release(): void {
      let state = marker();
      if (state === undefined) throw new Error(REPLACED);
      const nullable = state[KEY] === true;

      let descriptor = Object.getOwnPropertyDescriptor(state, KEY);
      if (!Object.isExtensible(state) || !descriptor?.configurable) {
        history.replaceState(state, "", url);
        state = marker();
        if (state === undefined) throw new Error(REPLACED);
        descriptor = Object.getOwnPropertyDescriptor(state, KEY);
      }
      if (!descriptor?.configurable || !delete state[KEY]) {
        throw new Error(LOCKED);
      }

      const base = nullable && Reflect.ownKeys(state).length === 0 ? null : state;
      try {
        history.replaceState(base, "", url);
      } catch (error) {
        Object.defineProperty(state, KEY, descriptor);
        throw error;
      }
      history.back();
    },
  };
}

export function createHistory(target: Window): Adapter {
  return {
    create: () => sentinel(target),
    listen(listener): void {
      target.addEventListener(
        "popstate",
        event => listener(() => event.stopImmediatePropagation()),
        true,
      );
    },
    back: () => target.history.back(),
  };
}
