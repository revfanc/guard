const KEY = "__revfanc_guard__";
const INVALID = "@revfanc/guard: history.state must be null or a plain object.";
const REPLACED = "@revfanc/guard: the history sentinel was replaced.";
const RESERVED = "@revfanc/guard: history.state contains the reserved guard key.";
const LOCKED = "@revfanc/guard: the history sentinel is not editable.";

type State = null | Record<string, unknown>;
type Role = "base" | "sentinel";
type Marker = {
  encoded: string;
  id: string;
  nullable: boolean;
  role: Role;
};

export interface Sentinel {
  current(): boolean;
  base(): boolean;
  restore(): void;
  release(): void;
  settle(): void;
}

export interface Adapter {
  create(): Sentinel;
  listen(listener: (intercept: () => void) => void): void;
  back(): void;
}

let sequence = 0;

function id(): string {
  return `${Date.now().toString(36)}-${(++sequence).toString(36)}-${
    Math.random().toString(36).slice(2) || "0"
  }`;
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

function own(value: Record<string, unknown>, key: string): PropertyDescriptor | undefined {
  return Object.getOwnPropertyDescriptor(value, key);
}

function parse(descriptor: PropertyDescriptor): Marker | undefined {
  const value: unknown = descriptor.value;
  if (typeof value !== "string") return undefined;

  const current = /^([bs]):([no]):([a-z0-9-]+)$/.exec(value);
  if (!current) return undefined;
  const markerId = current[3];
  if (!markerId) return undefined;
  return {
    encoded: value,
    id: markerId,
    nullable: current[2] === "n",
    role: current[1] === "b" ? "base" : "sentinel",
  };
}

function marker(state: State): Marker | undefined {
  if (state === null) return undefined;
  const descriptor = own(state, KEY);
  return descriptor && parse(descriptor);
}

function encoded(role: Role, nullable: boolean, markerId: string): string {
  return `${role === "base" ? "b" : "s"}:${nullable ? "n" : "o"}:${markerId}`;
}

function protocol(
  markerId: string,
  nullable: boolean,
  role: Role,
): Marker {
  return {
    encoded: encoded(role, nullable, markerId),
    id: markerId,
    nullable,
    role,
  };
}

function same(left: Marker | undefined, right: Marker): boolean {
  return (
    left?.encoded === right.encoded &&
    left.role === right.role
  );
}

function sentinel(target: Window): Sentinel {
  const { history, location } = target;
  const url = location.href;
  const read = (): State | undefined => {
    if (location.href !== url) return undefined;
    const state: unknown = history.state;
    return valid(state) ? state : undefined;
  };
  const requireState = (): State => {
    const state = read();
    if (state === undefined) throw new Error(REPLACED);
    return state;
  };
  const editable = (state: State): State => {
    if (
      state === null ||
      (Object.isExtensible(state) && (own(state, KEY)?.configurable ?? true))
    ) {
      return state;
    }
    history.replaceState(state, "", url);
    const current = requireState();
    if (
      current !== null &&
      (!Object.isExtensible(current) || !(own(current, KEY)?.configurable ?? true))
    ) {
      throw new Error(LOCKED);
    }
    return current;
  };
  const writeMarker = (
    method: "push" | "replace",
    state: State,
    next: Marker,
  ): void => {
    const value = editable(state) ?? {};
    const previous = own(value, KEY);
    Object.defineProperty(value, KEY, {
      configurable: true,
      enumerable: true,
      value: next.encoded,
      writable: true,
    });
    try {
      if (method === "push") history.pushState(value, "", url);
      else history.replaceState(value, "", url);
    } finally {
      if (previous) Object.defineProperty(value, KEY, previous);
      else delete value[KEY];
    }
  };
  const writeClean = (state: State, current: Marker): State => {
    if (state === null) throw new Error(REPLACED);
    const value = editable(state);
    if (value === null) throw new Error(REPLACED);
    const descriptor = own(value, KEY);
    const parsed = descriptor && parse(descriptor);
    if (!descriptor?.configurable || !parsed || !same(parsed, current)) {
      throw new Error(REPLACED);
    }
    if (!delete value[KEY]) throw new Error(LOCKED);
    const clean =
      current.nullable && Reflect.ownKeys(value).length === 0 ? null : value;
    try {
      history.replaceState(clean, "", url);
    } catch (error) {
      Object.defineProperty(value, KEY, descriptor);
      throw error;
    }
    return requireState();
  };

  const initial: unknown = history.state;
  assert(initial);
  const existing = marker(initial);
  if (initial !== null && own(initial, KEY) && !existing) {
    throw new Error(RESERVED);
  }
  let mode: Marker;

  if (existing) {
    mode = existing;
    if (existing.role === "base") {
      writeMarker(
        "push",
        initial,
        protocol(existing.id, existing.nullable, "sentinel"),
      );
      mode = protocol(existing.id, existing.nullable, "sentinel");
    }
  } else {
    const markerId = id();
    const nullable = initial === null;
    const base = protocol(markerId, nullable, "base");
    const current = protocol(markerId, nullable, "sentinel");
    writeMarker("replace", initial, base);
    try {
      writeMarker("push", requireState(), current);
    } catch (error) {
      try {
        writeClean(requireState(), base);
      } catch {
        // The original History API failure remains the useful creation error.
      }
      throw error;
    }
    mode = current;
  }

  let released: State | undefined;
  let releasing = false;
  const at = (role: Role): boolean => {
    const state = read();
    if (state === undefined) return false;
    return same(
      marker(state),
      protocol(mode.id, mode.nullable, role),
    );
  };

  return {
    current: () => at("sentinel"),
    base: () => at("base"),
    restore(): void {
      const state = requireState();
      if (!at("base")) throw new Error(REPLACED);
      writeMarker(
        "push",
        state,
        protocol(mode.id, mode.nullable, "sentinel"),
      );
    },
    release(): void {
      const state = requireState();
      if (!at("sentinel")) throw new Error(REPLACED);
      released = writeClean(state, mode);
      releasing = true;
      history.back();
    },
    settle(): void {
      if (!releasing || !at("base")) throw new Error(REPLACED);
      history.replaceState(released, "", url);
      releasing = false;
      released = undefined;
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
