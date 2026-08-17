import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Adapter,
  Sentinel,
} from "../../src/history";
import { Runtime } from "../../src/runtime";

const BASE_STATE = Symbol("base");
const SENTINEL_STATE = Symbol("sentinel");
const NO_FAILURE = Symbol("no failure");

class FakeSentinel implements Sentinel {
  atSentinel = true;
  atBase = false;
  restoreFailure: unknown;
  releaseFailure: unknown = NO_FAILURE;
  settleFailure: unknown = NO_FAILURE;
  readonly restore = vi.fn((): void => {
    if (this.restoreFailure) throw this.restoreFailure;
    if (!this.base()) throw new Error("not at base");
    this.atSentinel = true;
    this.atBase = false;
  });
  readonly release = vi.fn((): void => {
    if (!this.atSentinel) throw new Error("sentinel was replaced");
    if (this.releaseFailure !== NO_FAILURE) throw this.releaseFailure;
    this.atSentinel = false;
  });
  readonly settle = vi.fn((): void => {
    if (!this.atBase) throw new Error("not at base");
    if (this.settleFailure !== NO_FAILURE) throw this.settleFailure;
    this.atBase = false;
  });

  current(): boolean {
    return this.atSentinel;
  }

  base(): boolean {
    return this.atBase;
  }
}

class FakeHistory implements Adapter {
  readonly sentinels: FakeSentinel[] = [];
  readonly reportError = vi.fn();
  readonly back = vi.fn(() => {
    if (this.backFailure) throw this.backFailure;
  });
  createFailure: unknown;
  backFailure: unknown;
  private listener?: (intercept: () => void) => void;

  create(): Sentinel {
    if (this.createFailure) throw this.createFailure;
    const sentinel = new FakeSentinel();
    this.sentinels.push(sentinel);
    return sentinel;
  }

  listen(listener: (intercept: () => void) => void): void {
    this.listener = listener;
  }

  emit(state: unknown): ReturnType<typeof vi.fn> {
    const intercept = vi.fn();
    const sentinel = this.sentinels[this.sentinels.length - 1];
    if (sentinel) {
      sentinel.atSentinel = state === SENTINEL_STATE;
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
let runtime: Runtime;

function currentSentinel(): FakeSentinel {
  const sentinel = history.sentinels[history.sentinels.length - 1];
  if (!sentinel) throw new Error("missing fake sentinel");
  return sentinel;
}

beforeEach(() => {
  history = new FakeHistory();
  runtime = new Runtime(history, history.reportError);
});

describe("Runtime", () => {
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

  it("expires allow when a synchronous handler settles", async () => {
    let allowBack: (() => boolean) | undefined;
    const guard = runtime.add((allow) => {
      allowBack = allow;
    });

    history.emitBase();
    expect(allowBack?.()).toBe(false);

    const disposed = guard.dispose();
    history.emitBase();
    await disposed;
  });

  it("accepts a synchronous allow only once", async () => {
    const accepted: boolean[] = [];
    const guard = runtime.add((allow) => {
      accepted.push(allow(), allow());
    });

    history.emitBase();
    expect(accepted).toEqual([true, false]);

    const disposed = guard.dispose();
    history.emitBase();
    await disposed;
  });

  it("coalesces repeated Back while an asynchronous decision is pending", async () => {
    const decision = deferred();
    const onBack = vi
      .fn<(allow: () => boolean) => void | PromiseLike<void>>()
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
    let allowBack: (() => boolean) | undefined;
    const guard = runtime.add((current) => {
      allowBack = current;
      return decision.promise;
    });

    history.emitBase();
    expect(allowBack?.()).toBe(true);
    expect(currentSentinel().release).toHaveBeenCalledOnce();
    expect(history.back).not.toHaveBeenCalled();

    const disposed = guard.dispose();
    history.emitBase();
    expect(history.back).toHaveBeenCalledOnce();
    await expect(disposed).resolves.toBeUndefined();
    decision.resolve();
  });

  it("keeps a lower pending attempt paused until the upper guard is gone", async () => {
    const outerDecision = deferred();
    const innerDecision = deferred();
    let outerAllow: (() => boolean) | undefined;
    const outer = runtime.add((allow) => {
      outerAllow = allow;
      return outerDecision.promise;
    });
    history.emitBase();

    const inner = runtime.add(() => innerDecision.promise);
    history.emitBase();
    expect(outerAllow?.()).toBe(false);

    await inner.dispose();
    expect(outerAllow?.()).toBe(true);
    const disposed = outer.dispose();
    history.emitBase();
    await disposed;
    outerDecision.resolve();
    innerDecision.resolve();
  });

  it("allows a top logical layer without continuing the physical Back", async () => {
    const decision = deferred();
    const outer = runtime.add(vi.fn());
    let innerAllow: (() => boolean) | undefined;
    const inner = runtime.add((allow) => {
      innerAllow = allow;
      return decision.promise;
    });

    history.emitBase();
    expect(innerAllow?.()).toBe(true);
    expect(currentSentinel().release).not.toHaveBeenCalled();
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
    expect(currentSentinel().release).not.toHaveBeenCalled();

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
    let allowBack: (() => boolean) | undefined;
    const guard = runtime.add((current) => {
      allowBack = current;
      return decision.promise;
    });
    history.emitBase();

    expect(allowBack?.()).toBe(true);
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
    let allowBack: (() => boolean) | undefined;
    const guard = runtime.add((current) => {
      allowBack = current;
      return decision.promise;
    });
    history.emitBase();
    currentSentinel().releaseFailure = error;

    expect(allowBack?.()).toBe(false);
    expect(history.reportError).toHaveBeenCalledWith(error);
    expect(allowBack?.()).toBe(false);
    await expect(guard.dispose()).rejects.toBe(error);
    decision.resolve();
  });

  it("does not accept allow when release throws undefined", async () => {
    const decision = deferred();
    let allowBack: (() => boolean) | undefined;
    const guard = runtime.add((current) => {
      allowBack = current;
      return decision.promise;
    });
    history.emitBase();
    currentSentinel().releaseFailure = undefined;

    expect(allowBack?.()).toBe(false);
    expect(history.reportError).toHaveBeenCalledWith(undefined);
    await expect(guard.dispose()).rejects.toBeUndefined();
    decision.resolve();
  });

  it("re-arms after an unhandled callback rejection and reports it", async () => {
    const error = new Error("dialog failed");
    const onBack = vi
      .fn<(allow: () => boolean) => void | PromiseLike<void>>()
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

  it("ends a generation without treating external replacement as an error", async () => {
    const guard = runtime.add(vi.fn());
    currentSentinel().atSentinel = false;

    await expect(guard.dispose()).resolves.toBeUndefined();
    expect(history.reportError).not.toHaveBeenCalled();
    runtime.add(vi.fn());
    expect(history.sentinels).toHaveLength(2);
  });

  it("ends ownership lost during allow without reporting it", async () => {
    const decision = deferred();
    let allowBack: (() => boolean) | undefined;
    const guard = runtime.add((current) => {
      allowBack = current;
      return decision.promise;
    });
    history.emitBase();
    currentSentinel().atSentinel = false;

    expect(allowBack?.()).toBe(false);
    expect(history.reportError).not.toHaveBeenCalled();
    await expect(guard.dispose()).resolves.toBeUndefined();
    decision.resolve();
  });

  it("rejects the generation when sentinel restoration fails", async () => {
    const error = new Error("restore failed");
    const guard = runtime.add(vi.fn());
    currentSentinel().restoreFailure = error;

    expect(history.emitBase()).toHaveBeenCalledOnce();
    expect(history.reportError).toHaveBeenCalledWith(error);
    await expect(guard.dispose()).rejects.toBe(error);
  });

  it("rejects queued guards when sentinel recreation fails", async () => {
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

  it("does not consume or report a change that misses the known base", async () => {
    const guard = runtime.add(vi.fn());
    const intercept = history.emit({ external: true });

    expect(intercept).not.toHaveBeenCalled();
    expect(history.reportError).not.toHaveBeenCalled();
    await expect(guard.dispose()).resolves.toBeUndefined();
  });

  it("reports a final physical Back failure after closing the guard", async () => {
    const decision = deferred();
    const error = new Error("final back failed");
    let allowBack: (() => boolean) | undefined;
    const guard = runtime.add((current) => {
      allowBack = current;
      return decision.promise;
    });
    history.emitBase();
    history.backFailure = error;

    expect(allowBack?.()).toBe(true);
    const disposed = guard.dispose();
    history.emitBase();
    await expect(disposed).rejects.toBe(error);
    expect(history.reportError).toHaveBeenCalledWith(error);
    decision.resolve();
  });
});
