import { beforeEach, describe, expect, it, vi } from "vitest";
import type { History, Sentinel } from "../../src/history";
import { Runtime } from "../../src/runtime";

type Place = "active" | "base" | "inactive" | "other";

class Fake implements History, Sentinel {
  readonly back = vi.fn();
  readonly create = vi.fn(() => {
    if (this.createError) throw this.createError;
    this.place = "active";
    return this;
  });
  readonly release = vi.fn(() => {
    if (this.releaseError) throw this.releaseError;
    this.place = "inactive";
    this.back();
  });
  readonly restore = vi.fn(() => {
    if (this.restoreError) throw this.restoreError;
    this.place = "active";
  });
  readonly settle = vi.fn(() => {
    if (this.settleError) throw this.settleError;
    this.place = "base";
  });
  createError?: Error;
  releaseError?: Error;
  restoreError?: Error;
  settleError?: Error;
  private listener?: (intercept: () => void) => void;
  private place: Place = "other";

  active(): boolean {
    return this.place === "active";
  }

  base(): boolean {
    return this.place === "base";
  }

  inactive(): boolean {
    return this.place === "inactive";
  }

  listen(listener: (intercept: () => void) => void): void {
    this.listener = listener;
  }

  move(place: Place): void {
    this.place = place;
  }

  pop(place: Place): ReturnType<typeof vi.fn> {
    this.place = place;
    const intercept = vi.fn();
    this.listener?.(intercept);
    return intercept;
  }
}

function deferred(): { promise: Promise<void>; resolve(): void } {
  let resolve!: () => void;
  const promise = new Promise<void>((current) => {
    resolve = current;
  });
  return { promise, resolve };
}

let history: Fake;
let report: ReturnType<typeof vi.fn<(error: unknown) => void>>;
let runtime: Runtime;

beforeEach(() => {
  history = new Fake();
  report = vi.fn<(error: unknown) => void>();
  runtime = new Runtime(history, report);
});

describe("Runtime", () => {
  it("creates one buffer and shares it across registrations", () => {
    runtime.add(vi.fn());
    runtime.add(vi.fn());

    expect(history.create).toHaveBeenCalledOnce();
  });

  it("expires the previous page when a new registration loses ownership", async () => {
    const previous = vi.fn();
    const stopPrevious = runtime.add(previous);
    history.move("other");
    const current = vi.fn();
    runtime.add(current);

    await expect(stopPrevious()).resolves.toBeUndefined();
    expect(history.create).toHaveBeenCalledTimes(2);

    history.pop("base");
    expect(previous).not.toHaveBeenCalled();
    expect(current).toHaveBeenCalledOnce();
  });

  it("keeps a page registered while entering its active buffer", () => {
    const handler = vi.fn();
    runtime.add(handler);

    const intercept = history.pop("active");
    expect(intercept).not.toHaveBeenCalled();

    history.pop("base");
    expect(handler).toHaveBeenCalledOnce();
  });

  it("dispatches and consumes items in LIFO order", async () => {
    const calls: string[] = [];
    const outer = runtime.add((allow) => {
      calls.push("outer");
      allow();
    });
    const inner = runtime.add((allow) => {
      calls.push("inner");
      allow();
    });

    expect(history.pop("base")).toHaveBeenCalledOnce();
    expect(calls).toEqual(["inner"]);
    expect(history.restore).toHaveBeenCalledOnce();
    await inner();

    history.pop("base");
    expect(calls).toEqual(["inner", "outer"]);
    expect(history.release).toHaveBeenCalledOnce();
    expect(history.back).toHaveBeenCalledOnce();

    history.pop("base");
    await outer();
    expect(history.settle).toHaveBeenCalledOnce();
    expect(history.back).toHaveBeenCalledTimes(2);
  });

  it("retains a layer when its Handler does not allow", () => {
    const handler = vi.fn();
    runtime.add(handler);

    history.pop("base");
    history.pop("base");

    expect(handler).toHaveBeenCalledTimes(2);
    expect(history.restore).toHaveBeenCalledTimes(2);
    expect(history.release).not.toHaveBeenCalled();
  });

  it("does not invoke another Handler while one is pending", async () => {
    const decision = deferred();
    const handler = vi.fn(() => decision.promise);
    runtime.add(handler);

    history.pop("base");
    history.pop("base");

    expect(handler).toHaveBeenCalledOnce();
    expect(history.restore).toHaveBeenCalledTimes(2);
    decision.resolve();
    await decision.promise;
  });

  it("invalidates allow when the Attempt completes", () => {
    let stale: (() => void) | undefined;
    const handler = vi.fn((allow: () => void) => {
      stale = allow;
    });
    runtime.add(handler);

    history.pop("base");
    stale?.();
    history.pop("base");

    expect(handler).toHaveBeenCalledTimes(2);
    expect(history.release).not.toHaveBeenCalled();
  });

  it("keeps a new registration made during a pending Attempt", () => {
    const decision = deferred();
    let allow: (() => void) | undefined;
    const outer = runtime.add((current) => {
      allow = current;
      return decision.promise;
    });
    history.pop("base");
    const innerHandler = vi.fn();
    runtime.add(innerHandler);

    allow?.();
    expect(history.release).not.toHaveBeenCalled();
    history.pop("base");

    expect(innerHandler).toHaveBeenCalledOnce();
    void outer();
    decision.resolve();
  });

  it("reports Handler errors and keeps the layer", async () => {
    const failure = new Error("decision failed");
    const handler = vi
      .fn()
      .mockRejectedValueOnce(failure)
      .mockImplementationOnce(() => undefined);
    runtime.add(handler);

    history.pop("base");
    await Promise.resolve();
    await Promise.resolve();
    expect(report).toHaveBeenCalledWith(failure);

    history.pop("base");
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("returns one Promise and restores base when the last item stops", async () => {
    const stop = runtime.add(vi.fn());

    const first = stop();
    expect(stop()).toBe(first);
    expect(history.release).toHaveBeenCalledOnce();
    let settled = false;
    void first.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    history.pop("base");
    await expect(first).resolves.toBeUndefined();
    expect(history.back).toHaveBeenCalledOnce();
  });

  it("stops a non-final item without releasing the buffer", async () => {
    const outer = runtime.add(vi.fn());
    runtime.add(vi.fn());

    await outer();

    expect(history.release).not.toHaveBeenCalled();
  });

  it("stopping the active Attempt makes its allow ineffective", async () => {
    const decision = deferred();
    let allow: (() => void) | undefined;
    const stop = runtime.add((current) => {
      allow = current;
      return decision.promise;
    });
    history.pop("base");

    const cleanup = stop();
    allow?.();
    expect(history.release).toHaveBeenCalledOnce();
    history.pop("base");
    await cleanup;
    expect(history.back).toHaveBeenCalledOnce();
    decision.resolve();
  });

  it("restarts registrations created during cleanup", async () => {
    const first = runtime.add(vi.fn());
    const cleanup = first();
    const second = runtime.add(vi.fn());

    history.pop("base");
    await cleanup;
    expect(history.create).toHaveBeenCalledTimes(2);

    void second();
  });

  it("rejects entry into an inactive buffer without a Guard stack", () => {
    const stop = runtime.add(vi.fn());
    void stop();
    history.pop("base");
    history.back.mockClear();

    const intercept = history.pop("inactive");

    expect(intercept).toHaveBeenCalledOnce();
    expect(history.back).toHaveBeenCalledOnce();
  });

  it("fails open and expires the stack after an unknown POP", async () => {
    const handler = vi.fn();
    const stop = runtime.add(handler);
    const intercept = history.pop("other");

    expect(intercept).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
    await expect(stop()).resolves.toBeUndefined();
    expect(history.create).toHaveBeenCalledOnce();
  });

  it("expires cleanup and new items after an unknown POP", async () => {
    const first = runtime.add(vi.fn());
    const cleanup = first();
    const next = vi.fn();
    const stopNext = runtime.add(next);

    const intercept = history.pop("other");

    expect(intercept).not.toHaveBeenCalled();
    await expect(cleanup).resolves.toBeUndefined();
    await expect(stopNext()).resolves.toBeUndefined();
    expect(history.create).toHaveBeenCalledOnce();
    expect(next).not.toHaveBeenCalled();
  });

  it("does not intercept and expires the stack when restore fails", async () => {
    const handler = vi.fn();
    history.restoreError = new Error("push failed");
    const stop = runtime.add(handler);

    const intercept = history.pop("base");

    expect(intercept).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
    await expect(stop()).resolves.toBeUndefined();
    expect(history.create).toHaveBeenCalledOnce();
  });

  it("expires the last item when releasing the buffer fails", async () => {
    history.releaseError = new Error("replace failed");
    const stop = runtime.add(vi.fn());

    await expect(stop()).resolves.toBeUndefined();
    expect(history.create).toHaveBeenCalledOnce();
    expect(report).not.toHaveBeenCalled();
  });

  it("does not throw when History coordination fails", async () => {
    history.createError = new Error("push failed");
    const stop = runtime.add(vi.fn());

    await expect(stop()).resolves.toBeUndefined();
    expect(report).not.toHaveBeenCalled();
  });
});
