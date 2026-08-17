import {
  createHistory,
  type Adapter,
  type Sentinel,
} from "./history";
import type { BackGuard, BackHandler } from "./types";

const RUNTIME = Symbol.for("@revfanc/guard.runtime");
const LEAVING = "@revfanc/guard: a Back navigation is already being allowed.";
const CONFLICT = "@revfanc/guard: the runtime slot is already occupied.";

type Guard = {
  handler: BackHandler;
  allow?: () => boolean;
  settled: boolean;
  done: Promise<void>;
  resolve(): void;
  reject(error: unknown): void;
};
type Base = {
  sentinel: Sentinel;
  guards: Guard[];
};
type Active = Base & {
  status: "active";
};
type Cleaning = Base & {
  status: "cleaning";
  closing: Guard;
  action: "stay" | "leave";
};
type State = Active | Cleaning | undefined;
type Reporter = (error: unknown) => void;
type SharedRuntime = {
  add(handler: BackHandler): BackGuard;
};
type RuntimeWindow = Window & { [key: symbol]: unknown };

function reporter(target: Window): Reporter {
  return (error) => {
    const reportError = target.reportError;
    if (typeof reportError === "function") {
      reportError.call(target, error);
    } else {
      target.setTimeout(() => {
        throw error;
      }, 0);
    }
  };
}

function guard(handler: BackHandler): Guard {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const done = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  // A guard can fail from a popstate before its owner calls dispose().
  void done.catch(() => undefined);
  return { handler, settled: false, done, resolve, reject };
}

function shared(value: unknown): value is SharedRuntime {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { add?: unknown }).add === "function"
  );
}

export class Runtime implements SharedRuntime {
  private state: State;

  constructor(
    private readonly history: Adapter,
    private readonly report: Reporter,
  ) {
    history.listen((intercept) => this.change(intercept));
  }

  add(handler: BackHandler): BackGuard {
    const item = guard(handler);
    const state = this.state;

    if (!state) {
      this.activate([item]);
    } else if (state.status === "active") {
      let current: boolean;
      try {
        current = state.sentinel.current();
      } catch (error) {
        this.fail(state.guards, error);
        throw error;
      }
      if (!current) {
        this.finish(state.guards);
        this.activate([item]);
      } else {
        state.guards.push(item);
      }
    } else if (state.action === "leave") {
      throw new Error(LEAVING);
    } else {
      state.guards.push(item);
    }
    return {
      dispose: () => this.dispose(item),
    };
  }

  private activate(guards: Guard[]): void {
    this.state = {
      status: "active",
      sentinel: this.history.create(),
      guards,
    };
  }

  private top(guards: Guard[]): Guard | undefined {
    return guards[guards.length - 1];
  }

  private change(intercept: () => void): void {
    const state = this.state;
    if (!state) return;
    const active = state.status === "active";
    const guards = active
      ? state.guards
      : [state.closing, ...state.guards];
    let base: boolean;
    try {
      base = state.sentinel.base();
    } catch (error) {
      this.fail(guards, error, true);
      return;
    }
    if (!base) {
      this.finish(guards);
      return;
    }

    intercept();
    if (active) {
      try {
        state.sentinel.restore();
      } catch (error) {
        this.fail(state.guards, error, true);
        return;
      }
      const item = this.top(state.guards);
      if (item && !item.allow) this.dispatch(item);
      return;
    }

    try {
      state.sentinel.settle();
    } catch (error) {
      this.fail(guards, error, true);
      return;
    }

    this.state = undefined;
    if (state.action === "leave") {
      try {
        this.history.back();
      } catch (error) {
        this.reject(state.closing, error);
        this.report(error);
        return;
      }
      this.resolve(state.closing);
      return;
    }

    this.resolve(state.closing);
    if (state.guards.length === 0) return;
    try {
      this.activate(state.guards);
    } catch (error) {
      this.fail(state.guards, error, true);
    }
  }

  private dispatch(item: Guard): void {
    const allow = (): boolean => this.allow(item, allow);
    const finish = (): void => {
      if (item.allow === allow) item.allow = undefined;
    };
    const fail = (error: unknown): void => {
      finish();
      this.report(error);
    };
    item.allow = allow;
    try {
      const result = item.handler(allow);
      if (result && typeof result.then === "function") {
        Promise.resolve(result).then(finish, fail);
      } else {
        finish();
      }
    } catch (error) {
      fail(error);
    }
  }

  private allow(item: Guard, allow: () => boolean): boolean {
    const state = this.state;
    if (
      !state ||
      state.status !== "active" ||
      this.top(state.guards) !== item ||
      item.allow !== allow ||
      !this.owns(state)
    ) {
      return false;
    }

    if (state.guards.length === 1) {
      return this.clean(state, item, "leave", true);
    }
    state.guards.pop();
    this.resolve(item);
    return true;
  }

  private dispose(item: Guard): Promise<void> {
    if (item.settled) return item.done;
    const state = this.state;

    if (state?.status === "cleaning") {
      if (state.closing === item) return item.done;
      const index = state.guards.indexOf(item);
      if (index >= 0) {
        state.guards.splice(index, 1);
        this.resolve(item);
        return item.done;
      }
    } else if (state?.status === "active") {
      const index = state.guards.indexOf(item);
      if (index >= 0) {
        let current: boolean;
        try {
          current = state.sentinel.current();
        } catch (error) {
          this.fail(state.guards, error);
          return item.done;
        }
        if (!current) {
          this.finish(state.guards);
          return item.done;
        }
        if (state.guards.length > 1) {
          state.guards.splice(index, 1);
          this.resolve(item);
          return item.done;
        }

        this.clean(state, item, "stay", false);
        return item.done;
      }
    }

    this.reject(
      item,
      new Error("@revfanc/guard: the guard is no longer active."),
    );
    return item.done;
  }

  private clean(
    state: Active,
    item: Guard,
    action: Cleaning["action"],
    report: boolean,
  ): boolean {
    const cleaning: Cleaning = {
      status: "cleaning",
      sentinel: state.sentinel,
      guards: [],
      closing: item,
      action,
    };
    this.state = cleaning;
    try {
      state.sentinel.release();
    } catch (error) {
      this.fail([cleaning.closing, ...cleaning.guards], error);
      if (report) this.report(error);
      return false;
    }

    item.allow = undefined;
    return true;
  }

  private owns(state: Active): boolean {
    let current: boolean;
    try {
      current = state.sentinel.current();
    } catch (error) {
      this.fail(state.guards, error, true);
      return false;
    }
    if (current) return true;
    this.finish(state.guards);
    return false;
  }

  private resolve(item: Guard): void {
    if (item.settled) return;
    item.allow = undefined;
    item.settled = true;
    item.resolve();
  }

  private reject(item: Guard, error: unknown): void {
    if (item.settled) return;
    item.allow = undefined;
    item.settled = true;
    item.reject(error);
  }

  private finish(guards: Guard[]): void {
    for (const item of guards) this.resolve(item);
    this.state = undefined;
  }

  private fail(guards: Guard[], error: unknown, report = false): void {
    for (const item of guards) this.reject(item, error);
    this.state = undefined;
    if (report) this.report(error);
  }
}

export function createGuard(target: Window, handler: BackHandler): BackGuard {
  const runtimeTarget = target as RuntimeWindow;
  const existing = runtimeTarget[RUNTIME];
  if (existing !== undefined) {
    if (!shared(existing)) throw new Error(CONFLICT);
    return existing.add(handler);
  }

  const runtime = new Runtime(createHistory(target), reporter(target));
  Object.defineProperty(runtimeTarget, RUNTIME, {
    configurable: false,
    enumerable: false,
    value: runtime,
    writable: false,
  });
  return runtime.add(handler);
}
