import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  HistoryPort,
  HistorySentinel,
} from "../../src/history";
import { WindowCoordinator } from "../../src/runtime";
import type { BackAttempt } from "../../src/types";

const BASE_STATE = Symbol("base");
const SENTINEL_STATE = Symbol("sentinel");
const NO_FAILURE = Symbol("no failure");

class FakeSentinel implements HistorySentinel {
  current = true;
  atBase = true;
  restoreFailure: unknown;
  releaseFailure: unknown = NO_FAILURE;
  readonly restoreAtBase = vi.fn((): void => {
    if (this.restoreFailure) throw this.restoreFailure;
    if (!this.isAtBase()) throw new Error("not at base");
    this.current = true;
    this.atBase = false;
  });
  readonly releaseToBase = vi.fn((): void => {
    if (!this.current) throw new Error("sentinel was replaced");
    if (this.releaseFailure !== NO_FAILURE) throw this.releaseFailure;
    this.current = false;
  });

  isCurrent(): boolean {
    return this.current;
  }

  isAtBase(): boolean {
    return this.atBase;
  }
}

class FakeHistory implements HistoryPort {
  readonly sentinels: FakeSentinel[] = [];
  readonly reportError = vi.fn();
  readonly back = vi.fn(() => {
    if (this.backFailure) throw this.backFailure;
  });
  createFailure: unknown;
  backFailure: unknown;
  private listener?: (intercept: () => void) => void;

  createSentinel(): HistorySentinel {
    if (this.createFailure) throw this.createFailure;
    const sentinel = new FakeSentinel();
    this.sentinels.push(sentinel);
    return sentinel;
  }

  listenToPopState(listener: (intercept: () => void) => void): void {
    this.listener = listener;
  }

  emit(state: unknown): ReturnType<typeof vi.fn> {
    const intercept = vi.fn();
    const sentinel = this.sentinels[this.sentinels.length - 1];
    if (sentinel) {
      sentinel.current = state === SENTINEL_STATE;
      sentinel.atBase = state === BASE_STATE;
    }
    this.listener?.(intercept);
    return intercept;
  }

  emitBase(): ReturnType<typeof vi.fn> {
    return this.emit(BASE_STATE);
  }
}

function deferred(): {
  promise: Promise<void>;
  resolve(): void;
  reject(error: unknown): void;
} {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

let history: FakeHistory;
let runtime: WindowCoordinator;

function currentSentinel(): FakeSentinel {
  const sentinel = history.sentinels[history.sentinels.length - 1];
  if (!sentinel) throw new Error("missing fake sentinel");
  return sentinel;
}

beforeEach(() => {
  history = new FakeHistory();
  runtime = new WindowCoordinator(history, history.reportError);
});

describe("WindowCoordinator", () => {
  it("shares one sentinel and re-arms after a handler settles without allow", () => {
    const firstBack = vi.fn();
    const secondBack = vi.fn();
    const first = runtime.add(firstBack);
    const second = runtime.add(secondBack);

    expect(history.sentinels).toHaveLength(1);
    expect(history.emitBase()).toHaveBeenCalledOnce();
    history.emitBase();
    expect(secondBack).toHaveBeenCalledTimes(2);
    expect(firstBack).not.toHaveBeenCalled();

    void second.dispose();
    const disposed = first.dispose();
    history.emitBase();
    return disposed;
  });

  it("coalesces repeated Back while an asynchronous decision is pending", async () => {
    const decision = deferred();
    const onBack = vi
      .fn<(attempt: BackAttempt) => void | PromiseLike<void>>()
      .mockImplementationOnce(() => decision.promise)
      .mockImplementation(() => undefined);
    const guard = runtime.add(onBack);

    history.emitBase();
    history.emitBase();
    expect(onBack).toHaveBeenCalledOnce();

    decision.resolve();
    await decision.promise;
    await Promise.resolve();
    history.emitBase();
    expect(onBack).toHaveBeenCalledTimes(2);

    const disposed = guard.dispose();
    history.emitBase();
    await disposed;
  });

  it("allows the final Back only after sentinel cleanup reaches its base", async () => {
    const decision = deferred();
    let attempt: BackAttempt | undefined;
    const guard = runtime.add((current) => {
      attempt = current;
      return decision.promise;
    });

    history.emitBase();
    expect(attempt?.allow()).toBe(true);
    expect(currentSentinel().releaseToBase).toHaveBeenCalledOnce();
    expect(history.back).not.toHaveBeenCalled();

    const disposed = guard.dispose();
    history.emitBase();
    expect(history.back).toHaveBeenCalledOnce();
    await disposed;
    decision.resolve();
  });

  it("keeps a lower pending attempt paused until the upper guard is gone", async () => {
    const outerDecision = deferred();
    const innerDecision = deferred();
    let outerAttempt: BackAttempt | undefined;
    const outer = runtime.add((attempt) => {
      outerAttempt = attempt;
      return outerDecision.promise;
    });
    history.emitBase();

    const inner = runtime.add(() => innerDecision.promise);
    history.emitBase();
    expect(outerAttempt?.allow()).toBe(false);

    await inner.dispose();
    expect(outerAttempt?.allow()).toBe(true);
    const disposed = outer.dispose();
    history.emitBase();
    await disposed;
    outerDecision.resolve();
    innerDecision.resolve();
  });

  it("allows a top logical layer without continuing the physical Back", async () => {
    const decision = deferred();
    const outer = runtime.add(vi.fn());
    let innerAttempt: BackAttempt | undefined;
    const inner = runtime.add((attempt) => {
      innerAttempt = attempt;
      return decision.promise;
    });

    history.emitBase();
    expect(innerAttempt?.allow()).toBe(true);
    expect(currentSentinel().releaseToBase).not.toHaveBeenCalled();
    expect(history.back).not.toHaveBeenCalled();
    await inner.dispose();

    const disposed = outer.dispose();
    history.emitBase();
    await disposed;
    decision.resolve();
  });

  it("disposes any layer and awaits cleanup only for the final layer", async () => {
    const outer = runtime.add(vi.fn());
    const inner = runtime.add(vi.fn());

    await outer.dispose();
    expect(currentSentinel().releaseToBase).not.toHaveBeenCalled();

    let settled = false;
    const disposed = inner.dispose().then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    history.emitBase();
    await disposed;
    expect(settled).toBe(true);
  });

  it("queues recreate during final disposal and creates one new sentinel", async () => {
    const old = runtime.add(vi.fn());
    const oldDisposed = old.dispose();
    const replacementBack = vi.fn();
    const replacement = runtime.add(replacementBack);
    const cancelled = runtime.add(vi.fn());
    await cancelled.dispose();

    expect(history.sentinels).toHaveLength(1);
    history.emitBase();
    await oldDisposed;
    expect(history.sentinels).toHaveLength(2);

    history.emitBase();
    expect(replacementBack).toHaveBeenCalledOnce();
    const disposed = replacement.dispose();
    history.emitBase();
    await disposed;
  });

  it("rejects new guards after the final Back has been allowed", async () => {
    const decision = deferred();
    let attempt: BackAttempt | undefined;
    const guard = runtime.add((current) => {
      attempt = current;
      return decision.promise;
    });
    history.emitBase();

    expect(attempt?.allow()).toBe(true);
    expect(() => runtime.add(vi.fn())).toThrow(
      "a Back navigation is already being allowed",
    );

    const disposed = guard.dispose();
    history.emitBase();
    await disposed;
    decision.resolve();
  });

  it("fails closed when disposal cannot release the sentinel", async () => {
    const error = new Error("back failed");
    const guard = runtime.add(vi.fn());
    const sentinel = currentSentinel();
    sentinel.releaseFailure = error;

    await expect(guard.dispose()).rejects.toBe(error);
    await expect(guard.dispose()).rejects.toBe(error);
    expect(history.reportError).not.toHaveBeenCalled();

    const replacement = runtime.add(vi.fn());
    const disposed = replacement.dispose();
    history.emitBase();
    await disposed;
  });

  it("reports a failed allow and closes its guard", async () => {
    const decision = deferred();
    const error = new Error("back failed");
    let attempt: BackAttempt | undefined;
    const guard = runtime.add((current) => {
      attempt = current;
      return decision.promise;
    });
    history.emitBase();
    currentSentinel().releaseFailure = error;

    expect(attempt?.allow()).toBe(false);
    expect(history.reportError).toHaveBeenCalledWith(error);
    expect(attempt?.allow()).toBe(false);
    await expect(guard.dispose()).rejects.toBe(error);
    decision.resolve();
  });

  it("does not accept allow when release throws undefined", async () => {
    const decision = deferred();
    let attempt: BackAttempt | undefined;
    const guard = runtime.add((current) => {
      attempt = current;
      return decision.promise;
    });
    history.emitBase();
    currentSentinel().releaseFailure = undefined;

    expect(attempt?.allow()).toBe(false);
    expect(history.reportError).toHaveBeenCalledWith(undefined);
    await expect(guard.dispose()).rejects.toBeUndefined();
    decision.resolve();
  });

  it("re-arms after an unhandled callback rejection and reports it", async () => {
    const error = new Error("dialog failed");
    const onBack = vi
      .fn<(attempt: BackAttempt) => void | PromiseLike<void>>()
      .mockRejectedValueOnce(error)
      .mockImplementationOnce(() => undefined);
    const guard = runtime.add(onBack);

    history.emitBase();
    await vi.waitFor(() =>
      expect(history.reportError).toHaveBeenCalledWith(error),
    );
    history.emitBase();
    expect(onBack).toHaveBeenCalledTimes(2);

    const disposed = guard.dispose();
    history.emitBase();
    await disposed;
  });

  it("invalidates a generation when its sentinel was externally replaced", async () => {
    const guard = runtime.add(vi.fn());
    currentSentinel().current = false;

    await expect(guard.dispose()).rejects.toThrow("sentinel was replaced");
    expect(history.reportError).not.toHaveBeenCalled();
    await expect(guard.dispose()).rejects.toThrow("sentinel was replaced");
    runtime.add(vi.fn());
    expect(history.sentinels).toHaveLength(2);
  });

  it("reports ownership loss discovered by allow", async () => {
    const decision = deferred();
    let attempt: BackAttempt | undefined;
    const guard = runtime.add((current) => {
      attempt = current;
      return decision.promise;
    });
    history.emitBase();
    currentSentinel().current = false;

    expect(attempt?.allow()).toBe(false);
    expect(history.reportError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("sentinel was replaced") }),
    );
    await expect(guard.dispose()).rejects.toThrow("sentinel was replaced");
    decision.resolve();
  });

  it("invalidates a generation when sentinel restoration fails", async () => {
    const error = new Error("restore failed");
    const guard = runtime.add(vi.fn());
    currentSentinel().restoreFailure = error;

    expect(history.emitBase()).toHaveBeenCalledOnce();
    expect(history.reportError).toHaveBeenCalledWith(error);
    await expect(guard.dispose()).rejects.toBe(error);
  });

  it("invalidates queued guards when sentinel recreation fails", async () => {
    const old = runtime.add(vi.fn());
    const oldDisposed = old.dispose();
    const error = new Error("create failed");
    const replacement = runtime.add(vi.fn());
    history.createFailure = error;

    history.emitBase();
    await oldDisposed;
    expect(history.reportError).toHaveBeenCalledWith(error);
    await expect(replacement.dispose()).rejects.toBe(error);
  });

  it("does not consume a change that misses the known base", async () => {
    const guard = runtime.add(vi.fn());
    const intercept = history.emit({ external: true });

    expect(intercept).not.toHaveBeenCalled();
    expect(history.reportError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("guarded base") }),
    );
    await expect(guard.dispose()).rejects.toThrow("guarded base");
  });

  it("reports a final physical Back failure after closing the guard", async () => {
    const decision = deferred();
    const error = new Error("final back failed");
    let attempt: BackAttempt | undefined;
    const guard = runtime.add((current) => {
      attempt = current;
      return decision.promise;
    });
    history.emitBase();
    history.backFailure = error;

    expect(attempt?.allow()).toBe(true);
    const disposed = guard.dispose();
    history.emitBase();
    await disposed;
    expect(history.reportError).toHaveBeenCalledWith(error);
    decision.resolve();
  });
});
