import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  HistoryPort,
  Sentinel,
} from "../../src/history";
import { WindowCoordinator } from "../../src/runtime";
import type { BackAttempt, BackGuard } from "../../src/types";

const BASE_STATE = Symbol("base");
const SENTINEL_STATE = Symbol("sentinel");

class FakeSentinel implements Sentinel {
  current = true;
  atBase = true;
  rollbackSucceeds = true;
  restoreFailure: unknown;
  releaseFailure: unknown;
  readonly restore = vi.fn((state: unknown): void => {
    if (this.restoreFailure) {
      throw this.restoreFailure;
    }
    if (!this.isAtBase(state)) {
      throw new Error("not at base");
    }
    this.current = true;
  });
  readonly release = vi.fn((): void => {
    if (!this.current) {
      throw new Error("sentinel was replaced");
    }
    this.current = false;
    if (this.releaseFailure) {
      if (this.rollbackSucceeds) {
        this.current = true;
      }
      throw this.releaseFailure;
    }
  });

  matches(state: unknown): boolean {
    return state === SENTINEL_STATE;
  }

  isCurrent(): boolean {
    return this.current;
  }

  isAtBase(state: unknown): boolean {
    return this.atBase && state === BASE_STATE;
  }
}

class FakeHistory implements HistoryPort {
  readonly sentinels: FakeSentinel[] = [];
  readonly report = vi.fn();
  createFailure: unknown;
  private listener?: (state: unknown, intercept: () => void) => void;

  createSentinel(): Sentinel {
    if (this.createFailure) {
      throw this.createFailure;
    }
    const sentinel = new FakeSentinel();
    this.sentinels.push(sentinel);
    return sentinel;
  }

  listen(listener: (state: unknown, intercept: () => void) => void): void {
    this.listener = listener;
  }

  emit(state: unknown): ReturnType<typeof vi.fn> {
    const intercept = vi.fn();
    const sentinel = this.sentinels[this.sentinels.length - 1];
    if (sentinel) {
      sentinel.current = state === SENTINEL_STATE;
    }
    this.listener?.(state, intercept);
    return intercept;
  }

  emitBase(): ReturnType<typeof vi.fn> {
    return this.emit(BASE_STATE);
  }
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
  runtime = new WindowCoordinator(history);
});

describe("WindowCoordinator", () => {
  it("shares one sentinel and coalesces Back while an attempt is pending", () => {
    const firstBack = vi.fn();
    const secondAttempts: BackAttempt[] = [];
    runtime.add({ onBack: firstBack });
    const second = runtime.add({
      onBack(attempt) {
        secondAttempts.push(attempt);
      },
    });

    expect(history.sentinels).toHaveLength(1);
    expect(history.emitBase()).toHaveBeenCalledOnce();
    history.emitBase();
    expect(secondAttempts).toHaveLength(1);
    expect(firstBack).not.toHaveBeenCalled();

    expect(secondAttempts[0]?.resolve()).toBe(true);
    expect(secondAttempts[0]?.resolve()).toBe(false);
    history.emitBase();
    expect(secondAttempts).toHaveLength(2);
    expect(second.resolve()).toBe(true);
  });

  it("keeps a lower attempt pending while a higher layer owns resolution", () => {
    let outerAttempt: BackAttempt | undefined;
    const outerBack = vi.fn((attempt: BackAttempt) => {
      outerAttempt = attempt;
    });
    const outer = runtime.add({ onBack: outerBack });
    history.emitBase();

    let innerAttempt: BackAttempt | undefined;
    const inner = runtime.add({
      onBack(attempt) {
        innerAttempt = attempt;
      },
    });
    history.emitBase();

    const action = vi.fn();
    expect(outerAttempt?.resolve(action)).toBe(false);
    expect(action).not.toHaveBeenCalled();
    expect(innerAttempt).toBeDefined();

    expect(inner.resolve()).toBe(true);
    expect(outerAttempt?.resolve()).toBe(true);
    expect(outerBack).toHaveBeenCalledOnce();
    expect(outer.resolve()).toBe(true);
  });

  it("consumes only the top layer and runs its action after committing state", () => {
    let outerAttempt: BackAttempt | undefined;
    const outer = runtime.add({
      onBack(attempt) {
        outerAttempt = attempt;
      },
    });
    history.emitBase();

    let innerAttempt: BackAttempt | undefined;
    const inner = runtime.add({
      onBack(attempt) {
        innerAttempt = attempt;
      },
    });
    history.emitBase();

    const action = vi.fn(() => {
      expect(inner.resolve()).toBe(false);
      expect(outerAttempt?.resolve()).toBe(true);
    });
    expect(innerAttempt?.resolve(action)).toBe(true);
    expect(action).toHaveBeenCalledOnce();
    expect(outer.resolve()).toBe(true);
  });

  it("allows silent removal from any layer but action only from the top", () => {
    const outerAction = vi.fn();
    const outer = runtime.add({ onBack: vi.fn() });
    const inner = runtime.add({ onBack: vi.fn() });

    expect(outer.resolve(outerAction)).toBe(false);
    expect(outerAction).not.toHaveBeenCalled();
    expect(outer.resolve()).toBe(true);

    const innerAction = vi.fn();
    expect(inner.resolve(innerAction)).toBe(true);
    expect(innerAction).not.toHaveBeenCalled();
    history.emitBase();
    expect(innerAction).toHaveBeenCalledOnce();
  });

  it("runs the final action only after the base change and commits first", () => {
    let replacement: BackGuard | undefined;
    const action = vi.fn(() => {
      replacement = runtime.add({ onBack: vi.fn() });
    });
    const guard = runtime.add({ onBack: vi.fn() });
    const sentinel = history.sentinels[0];

    expect(guard.resolve(action)).toBe(true);
    expect(sentinel?.release).toHaveBeenCalledOnce();
    expect(action).not.toHaveBeenCalled();
    expect(() => runtime.add({ onBack: vi.fn() })).toThrow(
      "navigation action is already being committed",
    );

    expect(history.emitBase()).toHaveBeenCalledOnce();
    expect(action).toHaveBeenCalledOnce();
    expect(history.sentinels).toHaveLength(2);
    expect(replacement?.resolve()).toBe(true);
  });

  it("queues recreate during silent final traversal and pushes one new sentinel", () => {
    const old = runtime.add({ onBack: vi.fn() });
    expect(old.resolve()).toBe(true);
    expect(history.sentinels).toHaveLength(1);

    const onBack = vi.fn();
    const replacement = runtime.add({ onBack });
    const another = runtime.add({ onBack: vi.fn() });
    expect(history.sentinels).toHaveLength(1);
    expect(another.resolve()).toBe(true);

    history.emitBase();
    expect(history.sentinels).toHaveLength(2);
    history.emitBase();
    expect(onBack).toHaveBeenCalledOnce();
    expect(replacement.resolve()).toBe(true);
  });

  it("lets a queued replacement disappear silently but not commit an action", () => {
    const old = runtime.add({ onBack: vi.fn() });
    expect(old.resolve()).toBe(true);
    const queued = runtime.add({ onBack: vi.fn() });
    const action = vi.fn();

    expect(queued.resolve(action)).toBe(false);
    expect(queued.resolve()).toBe(true);
    history.emitBase();

    expect(action).not.toHaveBeenCalled();
    expect(history.sentinels).toHaveLength(1);
    expect(queued.resolve()).toBe(false);
  });

  it("rolls back a synchronous history.back failure and keeps the guard pending", () => {
    const error = new Error("back failed");
    const onError = vi.fn();
    const guard = runtime.add({ onBack: vi.fn(), onError });
    const sentinel = currentSentinel();
    sentinel.releaseFailure = error;
    const action = vi.fn();

    expect(guard.resolve(action)).toBe(false);
    expect(sentinel.current).toBe(true);
    expect(onError).toHaveBeenCalledWith(error);
    expect(action).not.toHaveBeenCalled();

    sentinel.releaseFailure = undefined;
    expect(guard.resolve(action)).toBe(true);
    history.emitBase();
    expect(action).toHaveBeenCalledOnce();
  });

  it("fails closed if a synchronous back failure cannot be rolled back", () => {
    const error = new Error("back failed after replacement");
    const onError = vi.fn();
    const guard = runtime.add({ onBack: vi.fn(), onError });
    const sentinel = currentSentinel();
    sentinel.releaseFailure = error;
    sentinel.rollbackSucceeds = false;

    expect(guard.resolve()).toBe(false);
    expect(guard.resolve()).toBe(false);
    expect(onError).toHaveBeenCalledWith(error);

    const replacement = runtime.add({ onBack: vi.fn() });
    expect(history.sentinels).toHaveLength(2);
    expect(replacement.resolve()).toBe(true);
  });

  it("re-arms an unresolved callback rejection and reports it", async () => {
    const error = new Error("dialog failed");
    const onError = vi.fn();
    const onBack = vi
      .fn<(attempt: BackAttempt) => void | PromiseLike<void>>()
      .mockRejectedValueOnce(error)
      .mockImplementationOnce(() => undefined);
    const guard = runtime.add({ onBack, onError });

    history.emitBase();
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(error));
    history.emitBase();
    expect(onBack).toHaveBeenCalledTimes(2);
    expect(guard.resolve()).toBe(true);
  });

  it("reports action rejection without resurrecting a consumed layer", async () => {
    const error = new Error("action failed");
    const onError = vi.fn();
    const outer = runtime.add({ onBack: vi.fn() });
    const inner = runtime.add({ onBack: vi.fn(), onError });

    expect(inner.resolve(() => Promise.reject(error))).toBe(true);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(error));
    expect(inner.resolve()).toBe(false);
    expect(outer.resolve()).toBe(true);
  });

  it("invalidates the generation when its sentinel was externally replaced", () => {
    const onError = vi.fn();
    const guard = runtime.add({ onBack: vi.fn(), onError });
    currentSentinel().current = false;

    expect(guard.resolve()).toBe(false);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("sentinel was replaced") }),
    );
    expect(guard.resolve()).toBe(false);

    runtime.add({ onBack: vi.fn() });
    expect(history.sentinels).toHaveLength(2);
  });

  it("invalidates a generation when sentinel restoration fails", () => {
    const error = new Error("restore failed");
    const onError = vi.fn();
    const guard = runtime.add({ onBack: vi.fn(), onError });
    currentSentinel().restoreFailure = error;

    expect(history.emitBase()).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(error);
    expect(guard.resolve()).toBe(false);
  });

  it("invalidates a queued generation when sentinel recreation fails", () => {
    const first = runtime.add({ onBack: vi.fn() });
    expect(first.resolve()).toBe(true);
    const error = new Error("create failed");
    const onError = vi.fn();
    const replacement = runtime.add({ onBack: vi.fn(), onError });
    history.createFailure = error;

    history.emitBase();
    expect(onError).toHaveBeenCalledWith(error);
    expect(replacement.resolve()).toBe(false);
  });

  it("does not consume a change that misses the known base", () => {
    const onError = vi.fn();
    const guard = runtime.add({ onBack: vi.fn(), onError });

    const intercept = history.emit({ external: true });

    expect(intercept).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("guarded base") }),
    );
    expect(guard.resolve()).toBe(false);
  });

});
