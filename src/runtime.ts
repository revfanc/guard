import {
  assertSupportedState,
  clearCurrentSentinel,
  isOwnSentinel,
  pushSentinel,
} from "./history-state";
import type { BackAttempt, BackGuard, BackGuardOptions } from "./types";

const RUNTIME_SYMBOL = Symbol.for("@revfanc/guard.runtime");

type RuntimePhase = "idle" | "active" | "cleaning";
type GuardState = "armed" | "prompting" | "disposed";

interface GuardRecord {
  readonly options: BackGuardOptions;
  state: GuardState;
  token?: object;
}

type RuntimeWindow = Window & {
  [RUNTIME_SYMBOL]?: GuardRuntime;
};

function createId(): string {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
}

function reportError(
  target: Window,
  record: GuardRecord | undefined,
  error: unknown,
): void {
  if (record?.options.onError) {
    try {
      record.options.onError(error);
      return;
    } catch (onErrorFailure) {
      error = onErrorFailure;
    }
  }

  const reporter = (target as Window & { reportError?: (value: unknown) => void })
    .reportError;
  if (typeof reporter === "function") {
    reporter.call(target, error);
    return;
  }

  void Promise.resolve().then(() => {
    throw error;
  });
}

class GuardRuntime {
  private readonly target: RuntimeWindow;
  private readonly guards: GuardRecord[] = [];
  private phase: RuntimePhase = "idle";
  private sentinelId?: string;
  private currentIsSentinel = false;
  private cleanupAction?: () => void | Promise<void>;
  private cleanupRecord?: GuardRecord;

  constructor(target: RuntimeWindow) {
    this.target = target;
    target.addEventListener("popstate", (event) => this.handlePopState(event), true);
  }

  add(options: BackGuardOptions): BackGuard {
    if (this.phase === "cleaning") {
      throw new Error("@revfanc/guard: the final guard is being completed.");
    }

    if (this.guards.length === 0) {
      this.activate();
    } else if (!this.ownsCurrentSentinel()) {
      const error = new Error("@revfanc/guard: the history sentinel was replaced.");
      this.stop(error, this.top());
      throw error;
    }

    const record: GuardRecord = { options, state: "armed" };
    this.guards.push(record);
    return { dispose: (): void => this.dispose(record) };
  }

  private activate(): void {
    const state: unknown = this.target.history.state;
    assertSupportedState(state);
    this.sentinelId = createId();
    pushSentinel(
      this.target,
      state,
      this.sentinelId,
      this.target.location.href,
    );
    this.currentIsSentinel = true;
    this.phase = "active";
  }

  private top(): GuardRecord | undefined {
    return this.guards.length > 0
      ? this.guards[this.guards.length - 1]
      : undefined;
  }

  private ownsCurrentSentinel(): boolean {
    return this.currentIsSentinel &&
      this.sentinelId !== undefined &&
      isOwnSentinel(this.target.history.state, this.sentinelId);
  }

  private handlePopState(event: PopStateEvent): void {
    const id = this.sentinelId;
    if (this.phase === "idle") {
      if (id && isOwnSentinel(event.state, id)) {
        try {
          clearCurrentSentinel(this.target, id);
        } catch (error) {
          reportError(this.target, undefined, error);
        }
      }
      return;
    }

    if (this.phase === "cleaning") {
      this.finishCleanup(event);
      return;
    }

    if (!id) {
      return;
    }
    if (isOwnSentinel(event.state, id)) {
      this.currentIsSentinel = true;
      return;
    }
    if (!this.currentIsSentinel) {
      return;
    }

    event.stopImmediatePropagation();
    this.currentIsSentinel = false;

    try {
      pushSentinel(this.target, event.state, id, this.target.location.href);
      this.currentIsSentinel = true;
    } catch (error) {
      this.stop(error, this.top());
      return;
    }

    const top = this.top();
    if (top?.state === "armed") {
      this.dispatch(top);
    }
  }

  private dispatch(record: GuardRecord): void {
    const token = {};
    record.state = "prompting";
    record.token = token;

    const attempt: BackAttempt = {
      stay: (): boolean => this.stay(record, token),
      done: (action): boolean => this.done(record, token, action),
    };

    try {
      const result = record.options.onBack(attempt);
      if (result && typeof result.then === "function") {
        Promise.resolve(result).then(undefined, (error: unknown) => {
          this.recoverFailedAttempt(record, token, error);
        });
      }
    } catch (error) {
      this.recoverFailedAttempt(record, token, error);
    }
  }

  private recoverFailedAttempt(
    record: GuardRecord,
    token: object,
    error: unknown,
  ): void {
    if (record.state === "prompting" && record.token === token) {
      record.state = "armed";
      record.token = undefined;
    }
    reportError(this.target, record, error);
  }

  private isCurrentAttempt(record: GuardRecord, token: object): boolean {
    return this.phase === "active" &&
      this.top() === record &&
      record.state === "prompting" &&
      record.token === token;
  }

  private stay(record: GuardRecord, token: object): boolean {
    if (!this.isCurrentAttempt(record, token)) {
      return false;
    }
    record.state = "armed";
    record.token = undefined;
    return true;
  }

  private done(
    record: GuardRecord,
    token: object,
    action: () => void | Promise<void>,
  ): boolean {
    if (typeof action !== "function") {
      throw new TypeError("@revfanc/guard: done() requires an action function.");
    }
    if (!this.isCurrentAttempt(record, token)) {
      return false;
    }

    if (this.guards.length > 1) {
      this.remove(record);
      this.runAction(record, action);
      return true;
    }
    if (!this.ownsCurrentSentinel()) {
      const error = new Error("@revfanc/guard: the history sentinel was replaced.");
      this.stop(error, record);
      return false;
    }

    this.remove(record);
    this.phase = "cleaning";
    this.cleanupAction = action;
    this.cleanupRecord = record;
    try {
      this.target.history.back();
    } catch (error) {
      this.cancelCleanup(error);
    }
    return true;
  }

  private finishCleanup(event: PopStateEvent): void {
    const id = this.sentinelId;
    if (!id || isOwnSentinel(event.state, id)) {
      this.cancelCleanup(
        new Error("@revfanc/guard: the sentinel cleanup did not reach its base."),
      );
      return;
    }

    event.stopImmediatePropagation();
    this.currentIsSentinel = false;
    const action = this.cleanupAction;
    const record = this.cleanupRecord;
    this.cleanupAction = undefined;
    this.cleanupRecord = undefined;
    this.phase = "idle";
    if (action && record) {
      this.runAction(record, action);
    }
  }

  private cancelCleanup(error: unknown): void {
    const record = this.cleanupRecord;
    this.cleanupAction = undefined;
    this.cleanupRecord = undefined;
    this.currentIsSentinel = false;
    this.phase = "idle";
    reportError(this.target, record, error);
  }

  private runAction(
    record: GuardRecord,
    action: () => void | Promise<void>,
  ): void {
    try {
      const result = action();
      if (result && typeof result.then === "function") {
        Promise.resolve(result).then(undefined, (error: unknown) => {
          reportError(this.target, record, error);
        });
      }
    } catch (error) {
      reportError(this.target, record, error);
    }
  }

  private dispose(record: GuardRecord): void {
    if (record.state === "disposed") {
      return;
    }
    this.remove(record);
    if (this.guards.length > 0 || this.phase !== "active") {
      return;
    }

    const id = this.sentinelId;
    try {
      if (!id || !this.ownsCurrentSentinel()) {
        throw new Error("@revfanc/guard: the history sentinel was replaced.");
      }
      clearCurrentSentinel(this.target, id);
    } catch (error) {
      reportError(this.target, record, error);
    } finally {
      this.currentIsSentinel = false;
      this.phase = "idle";
    }
  }

  private remove(record: GuardRecord): void {
    const index = this.guards.indexOf(record);
    if (index >= 0) {
      this.guards.splice(index, 1);
    }
    record.token = undefined;
    record.state = "disposed";
  }

  private stop(error: unknown, record: GuardRecord | undefined): void {
    for (let index = 0; index < this.guards.length; index += 1) {
      const guard = this.guards[index];
      if (guard) {
        guard.state = "disposed";
        guard.token = undefined;
      }
    }
    this.guards.length = 0;
    this.currentIsSentinel = false;
    this.phase = "idle";
    reportError(this.target, record, error);
  }
}

export function createGuard(
  target: Window,
  options: BackGuardOptions,
): BackGuard {
  const runtimeTarget = target as RuntimeWindow;
  let runtime = runtimeTarget[RUNTIME_SYMBOL];
  if (!runtime) {
    runtime = new GuardRuntime(runtimeTarget);
    runtimeTarget[RUNTIME_SYMBOL] = runtime;
  }
  return runtime.add(options);
}
