import { createHistory, type History, type Sentinel } from "./history";
import type { Guard, Handler } from "./types";

const RUNTIME = Symbol.for("@revfanc/guard.runtime.v1");

type Item = {
  active: boolean;
  close(): void;
  closed: Promise<void>;
  handler: Handler;
};

type Attempt = {
  allow(): void;
  item: Item;
};

type Active = {
  items: Item[];
  phase: "active";
  sentinel: Sentinel;
};

type Cleaning = {
  action: "leave" | "stay";
  closing: Item;
  phase: "cleaning";
  restart: Item[];
  sentinel: Sentinel;
};

type State = Active | Cleaning | undefined;
type Reporter = (error: unknown) => void;
type Shared = {
  protocol: 1;
  add(handler: Handler): Guard;
};
type RuntimeWindow = Window & { [key: symbol]: unknown };

const fallback = new WeakMap<Window, Shared>();

function item(handler: Handler): Item {
  let close!: () => void;
  const closed = new Promise<void>((resolve) => {
    close = resolve;
  });
  return { active: true, close, closed, handler };
}

function shared(value: unknown): value is Shared {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Partial<Shared>;
  return candidate.protocol === 1 && typeof candidate.add === "function";
}

function reporter(target: Window): Reporter {
  return (error) => {
    if (typeof target.reportError === "function") {
      target.reportError.call(target, error);
    } else {
      target.setTimeout(() => {
        throw error;
      }, 0);
    }
  };
}

export class Runtime implements Shared {
  readonly protocol = 1 as const;
  private attempt?: Attempt;
  private state: State;

  constructor(
    private readonly history: History,
    private readonly report: Reporter,
  ) {
    history.listen((intercept) => this.change(intercept));
  }

  add(handler: Handler): Guard {
    const current = item(handler);
    const state = this.state;
    if (!state) {
      this.activate([current]);
    } else if (state.phase === "cleaning") {
      state.restart.push(current);
    } else {
      let owned = false;
      try {
        owned = state.sentinel.active();
      } catch {
        // Re-coordinate below.
      }
      if (owned) {
        state.items.push(current);
      } else {
        const items = [...state.items, current];
        this.attempt = undefined;
        this.state = undefined;
        this.activate(items);
      }
    }

    let stopped = false;
    const stop: Guard = () => {
      if (!stopped) {
        stopped = true;
        this.stop(current);
      }
      return current.closed;
    };
    return stop;
  }

  private activate(items: Item[]): void {
    const active = items.filter((current) => current.active);
    if (active.length === 0) return;
    try {
      this.state = {
        items: active,
        phase: "active",
        sentinel: this.history.create(),
      };
    } catch {
      this.state = undefined;
      for (const current of active) this.finish(current);
    }
  }

  private change(intercept: () => void): void {
    try {
      if (this.history.inactive()) {
        intercept();
        this.history.back();
        return;
      }
    } catch {
      return;
    }

    const state = this.state;
    if (!state) return;
    let base = false;
    try {
      base = state.sentinel.base();
    } catch {
      // Unknown traversal is allowed below.
    }
    if (!base) {
      const items = state.phase === "active" ? state.items : state.restart;
      if (state.phase === "cleaning") this.finish(state.closing);
      this.attempt = undefined;
      this.state = undefined;
      this.history.defer(() => this.activate(items));
      return;
    }

    if (state.phase === "active") {
      try {
        state.sentinel.restore();
      } catch {
        this.state = undefined;
        this.attempt = undefined;
        this.history.defer(() => this.activate(state.items));
        return;
      }
      intercept();
      if (!this.attempt) {
        const top = state.items[state.items.length - 1];
        if (top) this.dispatch(top);
      }
      return;
    }

    intercept();
    try {
      state.sentinel.settle();
    } catch {
      // The traversal already reached a clean entry. Continue fail-open.
    }
    this.state = undefined;
    this.finish(state.closing);
    const restart = state.restart.filter((current) => current.active);
    if (restart.length > 0) {
      this.activate(restart);
    } else if (state.action === "leave") {
      try {
        this.history.back();
      } catch {
        // The protected traversal has already been released.
      }
    }
  }

  private dispatch(current: Item): void {
    let valid = true;
    const attempt: Attempt = {
      allow: () => {
        if (!valid) return;
        valid = false;
        this.allow(attempt);
      },
      item: current,
    };
    this.attempt = attempt;
    const finish = (): void => {
      valid = false;
      if (this.attempt === attempt) this.attempt = undefined;
    };
    const fail = (error: unknown): void => {
      finish();
      this.report(error);
    };

    try {
      const result = current.handler(attempt.allow);
      if (result && typeof result.then === "function") {
        Promise.resolve(result).then(finish, fail);
      } else {
        finish();
      }
    } catch (error) {
      fail(error);
    }
  }

  private allow(attempt: Attempt): void {
    const state = this.state;
    const current = attempt.item;
    if (
      this.attempt !== attempt ||
      !current.active ||
      !state ||
      state.phase !== "active"
    ) {
      return;
    }
    this.attempt = undefined;
    const index = state.items.indexOf(current);
    if (index < 0) return;
    state.items.splice(index, 1);
    if (state.items.length > 0) {
      this.finish(current);
      return;
    }
    this.clean(state, current, "leave");
  }

  private stop(current: Item): void {
    if (!current.active) return;
    const state = this.state;
    if (!state) {
      this.finish(current);
      return;
    }
    if (state.phase === "cleaning") {
      if (state.closing === current) return;
      const index = state.restart.indexOf(current);
      if (index >= 0) state.restart.splice(index, 1);
      this.finish(current);
      return;
    }

    const index = state.items.indexOf(current);
    if (index < 0) {
      this.finish(current);
      return;
    }
    state.items.splice(index, 1);
    if (this.attempt?.item === current) this.attempt = undefined;
    if (state.items.length > 0) {
      this.finish(current);
      return;
    }
    this.clean(state, current, "stay");
  }

  private clean(
    state: Active,
    closing: Item,
    action: Cleaning["action"],
  ): void {
    this.attempt = undefined;
    const cleaning: Cleaning = {
      action,
      closing,
      phase: "cleaning",
      restart: [],
      sentinel: state.sentinel,
    };
    this.state = cleaning;
    try {
      state.sentinel.release();
    } catch {
      this.state = undefined;
      this.finish(closing);
      this.history.defer(() => this.activate(cleaning.restart));
    }
  }

  private finish(current: Item): void {
    if (!current.active) return;
    current.active = false;
    current.close();
  }
}

export function add(target: Window, handler: Handler): Guard {
  const root = target as RuntimeWindow;
  let created: Shared | undefined;
  try {
    const existing = root[RUNTIME];
    if (shared(existing)) return existing.add(handler);
    if (existing === undefined) {
      created = new Runtime(createHistory(target), reporter(target));
      Object.defineProperty(root, RUNTIME, {
        configurable: false,
        enumerable: false,
        value: created,
        writable: false,
      });
      return created.add(handler);
    }
  } catch {
    // Fall through to the module-local registry.
  }

  let runtime = fallback.get(target) ?? created;
  if (!runtime) {
    try {
      runtime = new Runtime(createHistory(target), reporter(target));
    } catch {
      return () => Promise.resolve();
    }
  }
  fallback.set(target, runtime);
  return runtime.add(handler);
}
