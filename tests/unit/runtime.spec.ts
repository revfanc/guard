import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Adapter, Before, Pop } from "../../src/router";
import { Runtime } from "../../src/runtime";

class Fake implements Adapter {
  readonly afterCleanup = vi.fn();
  readonly beforeCleanup = vi.fn();
  readonly listenCleanup = vi.fn();
  private afterHandler?: (to: string, from: string) => void;
  private beforeHandler?: Before;
  private popHandler?: (pop: Pop) => void;
  private value = "/current";

  after(listener: (to: string, from: string) => void): () => void {
    this.afterHandler = listener;
    return this.afterCleanup;
  }

  before(listener: Before): () => void {
    this.beforeHandler = listener;
    return this.beforeCleanup;
  }

  listen(listener: (pop: Pop) => void): () => void {
    this.popHandler = listener;
    return this.listenCleanup;
  }

  pop(to = "/before", from = "/current", delta = -1): void {
    this.value = to;
    this.popHandler?.({ delta, from, to });
  }

  place(): string {
    return this.value;
  }

  async wait(place: string): Promise<void> {
    await vi.waitFor(() => expect(this.value).not.toBe(place));
  }

  restore(to: string): void {
    this.value = to;
  }

  route(
    to = "/before",
    from = "/current",
  ): boolean | void | PromiseLike<boolean | void> {
    return this.beforeHandler?.(to, from);
  }

  settle(to = "/before", from = "/current"): void {
    this.afterHandler?.(to, from);
  }
}

function deferred(): {
  promise: Promise<void>;
  resolve(): void;
} {
  let resolve!: () => void;
  const promise = new Promise<void>((current) => {
    resolve = current;
  });
  return { promise, resolve };
}

let adapter: Fake;
let runtime: Runtime;

beforeEach(() => {
  adapter = new Fake();
  runtime = new Runtime(adapter);
});

describe("Runtime", () => {
  it("ignores navigation without matching POP metadata", () => {
    const handler = vi.fn();
    runtime.add(handler);

    expect(adapter.route("/push", "/current")).toBeUndefined();
    expect(handler).not.toHaveBeenCalled();
  });

  it("keeps the top item when its handler does not allow", async () => {
    const handler = vi.fn();
    runtime.add(handler);

    adapter.pop();
    await expect(adapter.route()).resolves.toBe(false);
    adapter.pop();
    await expect(adapter.route()).resolves.toBe(false);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("allows the POP after consuming the final item", async () => {
    const handler = vi.fn((allow: () => void) => allow());
    runtime.add(handler);

    adapter.pop();
    await expect(adapter.route()).resolves.toBe(true);
    adapter.pop();
    expect(adapter.route()).toBeUndefined();
    expect(handler).toHaveBeenCalledOnce();
  });

  it("consumes one LIFO layer per POP", async () => {
    const calls: string[] = [];
    runtime.add((allow) => {
      calls.push("outer");
      allow();
    });
    runtime.add((allow) => {
      calls.push("inner");
      allow();
    });

    adapter.pop();
    await expect(adapter.route()).resolves.toBe(false);
    adapter.pop();
    await expect(adapter.route()).resolves.toBe(true);
    expect(calls).toEqual(["inner", "outer"]);
  });

  it("does not dispatch another handler while one is pending", async () => {
    const decision = deferred();
    const handler = vi.fn(() => decision.promise);
    runtime.add(handler);

    adapter.pop("/first");
    const first = adapter.route("/first");
    adapter.pop("/second", "/first");
    const second = adapter.route("/second", "/current");
    await vi.waitFor(() => expect(handler).toHaveBeenCalledOnce());

    decision.resolve();
    await expect(first).resolves.toBe(false);
    adapter.restore("/first");
    await expect(second).resolves.toBe(false);
  });

  it("stopping the active item invalidates allow and rejects the POP", async () => {
    const decision = deferred();
    let allow: (() => void) | undefined;
    const stop = runtime.add((current) => {
      allow = current;
      return decision.promise;
    });

    adapter.pop();
    const navigation = adapter.route();
    await vi.waitFor(() => expect(allow).toBeTypeOf("function"));
    stop();
    allow?.();

    await expect(navigation).resolves.toBe(false);
    decision.resolve();
    expect(adapter.afterCleanup).toHaveBeenCalledOnce();
    expect(adapter.beforeCleanup).toHaveBeenCalledOnce();
    expect(adapter.listenCleanup).toHaveBeenCalledOnce();
  });

  it("returns an idempotent stop function for any layer", async () => {
    const outer = runtime.add(vi.fn());
    const inner = runtime.add((allow) => allow());

    outer();
    outer();
    adapter.pop();
    await expect(adapter.route()).resolves.toBe(true);
    inner();

    expect(adapter.beforeCleanup).toHaveBeenCalledOnce();
  });

  it("propagates handler errors without removing the item", async () => {
    const error = new Error("failed");
    const handler = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockImplementationOnce(() => undefined);
    runtime.add(handler);

    adapter.pop();
    await expect(adapter.route()).rejects.toBe(error);
    adapter.pop();
    await expect(adapter.route()).resolves.toBe(false);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("clears stale POP metadata after navigation settles", () => {
    runtime.add(vi.fn());
    adapter.pop("/stale", "/current");
    adapter.settle("/redirect", "/current");

    expect(adapter.route("/stale", "/current")).toBeUndefined();
  });

  it("reinstalls listeners after the stack becomes active again", () => {
    const first = runtime.add(vi.fn());
    first();
    runtime.add(vi.fn());

    expect(adapter.beforeCleanup).toHaveBeenCalledOnce();
    expect(adapter.listenCleanup).toHaveBeenCalledOnce();
  });
});
