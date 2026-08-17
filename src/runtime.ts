import {
  createHistory,
  type Adapter,
  type Sentinel,
} from "./history";
import type { BackGuard, BackHandler } from "./types";

const REPLACED = "@revfanc/guard: the history sentinel was replaced.";
const LEAVING = "@revfanc/guard: a Back navigation is already being allowed.";
const CLOSED = Symbol("closed");

type Result = typeof CLOSED | { error: unknown };
type Guard = {
  handler: BackHandler;
  allow?: () => boolean;
  result?: Result;
  closed: Promise<Result>;
  close(result: Result): void;
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

const runtimes = new WeakMap<Window, Runtime>();

function reporter(target: Window): Reporter {
  return (error) => {
    const reportError = target.reportError;
    if (typeof reportError === "function") {
      reportError.call(target, error);
    } else {
      void Promise.resolve().then(() => {
        throw error;
      });
    }
  };
}

function guard(handler: BackHandler): Guard {
  let close!: (result: Result) => void;
  const closed = new Promise<Result>((resolve) => {
    close = resolve;
  });
  return { handler, closed, close };
}

function wait(item: Guard): Promise<void> {
  return item.closed.then((result) => {
    if (result !== CLOSED) throw result.error;
  });
}

export class Runtime {
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
      if (!state.sentinel.current()) {
        const error = new Error(REPLACED);
        this.fail(state.guards, error, false);
        throw error;
      }
      state.guards.push(item);
    } else if (state.action === "leave") {
      throw new Error(LEAVING);
    } else {
      state.guards.push(item);
    }
    return { dispose: () => this.dispose(item) };
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
    if (!state.sentinel.base()) {
      this.fail(
        guards,
        new Error(
          active
            ? "@revfanc/guard: back navigation missed the guarded base."
            : "@revfanc/guard: sentinel cleanup missed its base.",
        ),
      );
      return;
    }

    intercept();
    if (active) {
      try {
        state.sentinel.restore();
      } catch (error) {
        this.fail(state.guards, error);
        return;
      }
      const item = this.top(state.guards);
      if (item && !item.allow) this.dispatch(item);
      return;
    }

    this.close(state.closing, CLOSED);
    if (state.action === "leave") {
      this.state = undefined;
      try {
        this.history.back();
      } catch (error) {
        this.report(error);
      }
    } else if (state.guards.length === 0) {
      this.state = undefined;
    } else {
      try {
        this.activate(state.guards);
      } catch (error) {
        this.fail(state.guards, error);
      }
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
    this.close(item, CLOSED);
    return true;
  }

  private dispose(item: Guard): Promise<void> {
    if (item.result) return wait(item);
    const state = this.state;

    if (state?.status === "cleaning") {
      if (state.closing === item) return wait(item);
      const index = state.guards.indexOf(item);
      if (index >= 0) {
        state.guards.splice(index, 1);
        this.close(item, CLOSED);
        return wait(item);
      }
    } else if (state?.status === "active") {
      const index = state.guards.indexOf(item);
      if (index >= 0) {
        if (!state.sentinel.current()) {
          const error = new Error(REPLACED);
          this.fail(state.guards, error, false);
          return wait(item);
        }
        if (state.guards.length > 1) {
          state.guards.splice(index, 1);
          this.close(item, CLOSED);
          return wait(item);
        }

        this.clean(state, item, "stay", false);
        return wait(item);
      }
    }

    const error = new Error("@revfanc/guard: the guard is no longer active.");
    this.close(item, { error });
    return wait(item);
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
      this.fail([cleaning.closing, ...cleaning.guards], error, false);
      if (report) this.report(error);
      return false;
    }

    item.allow = undefined;
    return true;
  }

  private owns(state: Active): boolean {
    if (state.sentinel.current()) return true;
    this.fail(state.guards, new Error(REPLACED));
    return false;
  }

  private close(item: Guard, result: Result): void {
    if (item.result) return;
    item.allow = undefined;
    item.result = result;
    item.close(result);
  }

  private fail(guards: Guard[], error: unknown, report = true): void {
    for (const item of guards) this.close(item, { error });
    this.state = undefined;
    if (report) this.report(error);
  }
}

export function createGuard(target: Window, handler: BackHandler): BackGuard {
  let runtime = runtimes.get(target);
  if (!runtime) {
    runtime = new Runtime(createHistory(target), reporter(target));
    runtimes.set(target, runtime);
  }
  return runtime.add(handler);
}
