const KEY = "__revfanc_guard__";

type State = null | Record<string, unknown>;
type Role = "active" | "inactive";
type Marker = {
  encoded: string;
  id: string;
  nullable: boolean;
  role: Role;
};

export interface Sentinel {
  active(): boolean;
  base(): boolean;
  release(): void;
  restore(): void;
  settle(): void;
}

export interface History {
  back(): void;
  create(): Sentinel;
  inactive(): boolean;
  listen(listener: (intercept: () => void) => void): void;
}

let sequence = 0;

function identifier(): string {
  sequence += 1;
  const random = Math.random().toString(36).slice(2) || "0";
  return `${Date.now().toString(36)}-${sequence.toString(36)}-${random}`;
}

function plain(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function valid(value: unknown): value is State {
  return value === null || plain(value);
}

function own(
  value: Record<string, unknown>,
  key: string,
): PropertyDescriptor | undefined {
  return Object.getOwnPropertyDescriptor(value, key);
}

function parse(state: State): Marker | undefined {
  if (state === null) return undefined;
  const descriptor = own(state, KEY);
  const value: unknown = descriptor?.value;
  if (typeof value !== "string") return undefined;
  const match = /^([ai]):([no]):([a-z0-9-]+)$/.exec(value);
  const markerId = match?.[3];
  if (!match || !markerId) return undefined;
  return {
    encoded: value,
    id: markerId,
    nullable: match[2] === "n",
    role: match[1] === "a" ? "active" : "inactive",
  };
}

function marker(role: Role, nullable: boolean, id: string): Marker {
  return {
    encoded: `${role === "active" ? "a" : "i"}:${nullable ? "n" : "o"}:${id}`,
    id,
    nullable,
    role,
  };
}

function same(left: Marker | undefined, right: Marker): boolean {
  return left?.encoded === right.encoded;
}

function sentinel(target: Window): Sentinel {
  const { history, location } = target;
  const url = location.href;
  const read = (): State | undefined => {
    if (location.href !== url) return undefined;
    const current: unknown = history.state;
    return valid(current) ? current : undefined;
  };
  const requireState = (): State => {
    const current = read();
    if (current === undefined) throw new Error("history entry unavailable");
    return current;
  };
  const editable = (current: State): State => {
    if (
      current === null ||
      (Object.isExtensible(current) &&
        (own(current, KEY)?.configurable ?? true))
    ) {
      return current;
    }
    history.replaceState(current, "", url);
    const clone = requireState();
    if (
      clone !== null &&
      (!Object.isExtensible(clone) ||
        !(own(clone, KEY)?.configurable ?? true))
    ) {
      throw new Error("history entry unavailable");
    }
    return clone;
  };
  const write = (
    method: "push" | "replace",
    current: State,
    next: Marker,
  ): void => {
    const value = editable(current) ?? {};
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
  const clean = (current: State, expected: Marker): State => {
    if (current === null) throw new Error("history entry unavailable");
    const value = editable(current);
    if (value === null) throw new Error("history entry unavailable");
    const descriptor = own(value, KEY);
    if (
      !descriptor?.configurable ||
      !same(parse(value), expected) ||
      !delete value[KEY]
    ) {
      throw new Error("history entry unavailable");
    }
    return expected.nullable && Reflect.ownKeys(value).length === 0
      ? null
      : value;
  };

  const initial: unknown = history.state;
  if (!valid(initial)) throw new Error("history entry unavailable");
  const existing = parse(initial);
  if (initial !== null && own(initial, KEY) && !existing) {
    throw new Error("history entry unavailable");
  }

  let mode: Marker;
  if (existing) {
    mode = marker("active", existing.nullable, existing.id);
    if (existing.role === "inactive") write("replace", initial, mode);
  } else {
    mode = marker("active", initial === null, identifier());
    write("push", initial, mode);
  }

  let released: State | undefined;
  let releasing = false;
  const at = (role: Role): boolean => {
    const current = read();
    if (current === undefined) return false;
    return same(parse(current), marker(role, mode.nullable, mode.id));
  };

  return {
    active: () => at("active"),
    base(): boolean {
      const current = read();
      return (
        current !== undefined &&
        (current === null || !Object.prototype.hasOwnProperty.call(current, KEY))
      );
    },
    release(): void {
      const current = requireState();
      if (!at("active")) throw new Error("history entry unavailable");
      const value = clean(current, mode);
      history.replaceState(value, "", url);
      released = requireState();
      write(
        "replace",
        released,
        marker("inactive", mode.nullable, mode.id),
      );
      releasing = true;
      history.back();
    },
    restore(): void {
      const current = requireState();
      if (!this.base()) throw new Error("history entry unavailable");
      write("push", current, mode);
    },
    settle(): void {
      if (!releasing || !this.base() || released === undefined) {
        throw new Error("history entry unavailable");
      }
      history.replaceState(released, "", url);
      releasing = false;
      released = undefined;
    },
  };
}

export function createHistory(target: Window): History {
  return {
    back(): void {
      target.history.back();
    },
    create: () => sentinel(target),
    inactive(): boolean {
      const current: unknown = target.history.state;
      return valid(current) && parse(current)?.role === "inactive";
    },
    listen(listener): void {
      target.addEventListener(
        "popstate",
        (event) => listener(() => event.stopImmediatePropagation()),
        true,
      );
    },
  };
}
