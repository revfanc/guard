import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BackAttempt } from "../../src/types";

const runtimeSymbol = Symbol.for("@revfanc/guard.runtime");
const stateKey = "__revfanc_guard__";

let dom: JSDOM;

function target(): Window {
  return dom.window as unknown as Window;
}

async function back(): Promise<void> {
  target().history.back();
  await new Promise((resolve) => setTimeout(resolve, 25));
}

beforeEach(() => {
  dom = new JSDOM("<!doctype html><title>Guard test</title>", {
    url: "https://example.test/current",
  });
  const history = dom.window.history;
  const pushState = history.pushState.bind(history);
  const replaceState = history.replaceState.bind(history);
  vi.spyOn(history, "pushState").mockImplementation((data, unused, url) => {
    pushState(structuredClone(data), unused, url);
  });
  vi.spyOn(history, "replaceState").mockImplementation((data, unused, url) => {
    replaceState(structuredClone(data), unused, url);
  });
  vi.stubGlobal("window", dom.window);
});

afterEach(() => {
  delete (dom.window as unknown as Record<PropertyKey, unknown>)[runtimeSymbol];
  dom.window.close();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("MVP back guard", () => {
  it("imports without side effects and installs lazily", async () => {
    const addEventListener = vi.spyOn(target(), "addEventListener");
    vi.resetModules();
    const { createBackGuard, isBackGuardSupported } = await import("../../src/index");

    expect(addEventListener).not.toHaveBeenCalled();
    expect(isBackGuardSupported()).toBe(true);
    expect(addEventListener).not.toHaveBeenCalled();

    const first = createBackGuard({ onBack: vi.fn() });
    const second = createBackGuard({ onBack: vi.fn() });
    const popstateCalls = addEventListener.mock.calls.filter(
      ([eventName]) => eventName === "popstate",
    );
    expect(popstateCalls).toHaveLength(1);
    expect(popstateCalls[0]?.[2]).toBe(true);
    second.dispose();
    first.dispose();
  });

  it("is safe to import during SSR", async () => {
    vi.stubGlobal("window", undefined);
    vi.resetModules();
    const { createBackGuard, isBackGuardSupported } = await import("../../src/index");

    expect(isBackGuardSupported()).toBe(false);
    expect(() => createBackGuard({ onBack: vi.fn() })).toThrow(
      "requires a browser with the History API",
    );
  });

  it("validates callbacks before changing history", async () => {
    const { createBackGuard } = await import("../../src/index");
    const initialLength = target().history.length;

    expect(() => createBackGuard({ onBack: null } as never)).toThrow(
      "options.onBack must be a function",
    );
    expect(() =>
      createBackGuard({ onBack: vi.fn(), onError: true } as never),
    ).toThrow("options.onError must be a function");
    expect(target().history.length).toBe(initialLength);
  });

  it("preserves plain-object fields, cycles, and shared references", async () => {
    const { createBackGuard } = await import("../../src/index");
    const state: Record<string, unknown> = { route: "editor" };
    const shared: Record<string, unknown> = { draft: true };
    state.self = state;
    state.left = shared;
    state.right = shared;
    target().history.replaceState(state, "", "/editor");

    const guard = createBackGuard({ onBack: vi.fn() });
    const sentinel = target().history.state as Record<string, unknown>;
    expect(sentinel.self).toBe(sentinel);
    expect(sentinel.left).toBe(sentinel.right);
    expect(state).not.toHaveProperty(stateKey);

    guard.dispose();
    const restored = target().history.state as Record<string, unknown>;
    expect(restored).not.toHaveProperty(stateKey);
    expect(restored.self).toBe(restored);
    expect(restored.left).toBe(restored.right);
  });

  it.each([
    1,
    "state",
    [],
    new Date(),
    { [stateKey]: { application: true } },
  ])("rejects unsupported history state %#", async (state) => {
    const { createBackGuard } = await import("../../src/index");
    target().history.replaceState(state, "", target().location.href);

    expect(() => createBackGuard({ onBack: vi.fn() })).toThrow();
  });

  it("rejects a non-extensible current state", async () => {
    const { createBackGuard } = await import("../../src/index");
    target().history.replaceState({ route: "editor" }, "", target().location.href);
    Object.freeze(target().history.state);

    expect(() => createBackGuard({ onBack: vi.fn() })).toThrow(
      "history.state must be extensible",
    );
  });

  it("shares one sentinel across a LIFO stack", async () => {
    const { createBackGuard } = await import("../../src/index");
    const initialLength = target().history.length;
    const first = createBackGuard({ onBack: vi.fn() });
    const sentinelLength = target().history.length;
    const second = createBackGuard({ onBack: vi.fn() });

    expect(sentinelLength).toBe(initialLength + 1);
    expect(target().history.length).toBe(sentinelLength);
    second.dispose();
    first.dispose();
  });

  it("stays armed without duplicating a pending callback", async () => {
    const { createBackGuard } = await import("../../src/index");
    const attempts: BackAttempt[] = [];
    const guard = createBackGuard({
      onBack(attempt) {
        attempts.push(attempt);
      },
    });

    await back();
    expect(attempts).toHaveLength(1);
    await back();
    expect(attempts).toHaveLength(1);

    expect(attempts[0]?.stay()).toBe(true);
    expect(attempts[0]?.stay()).toBe(false);
    await back();
    expect(attempts).toHaveLength(2);
    guard.dispose();
  });

  it("pauses and resumes the original lower attempt", async () => {
    const { createBackGuard } = await import("../../src/index");
    const outerCalls = vi.fn();
    let outerAttempt: BackAttempt | undefined;
    const outer = createBackGuard({
      onBack(attempt) {
        outerCalls();
        outerAttempt = attempt;
      },
    });
    await back();

    let innerAttempt: BackAttempt | undefined;
    const inner = createBackGuard({ onBack: (attempt) => { innerAttempt = attempt; } });
    await back();

    const action = vi.fn();
    expect(outerAttempt?.done(action)).toBe(false);
    expect(action).not.toHaveBeenCalled();
    expect(innerAttempt).toBeDefined();

    inner.dispose();
    expect(outerAttempt?.stay()).toBe(true);
    expect(outerCalls).toHaveBeenCalledOnce();
    outer.dispose();
  });

  it("completes only the top layer without cascading", async () => {
    const { createBackGuard } = await import("../../src/index");
    let outerAttempt: BackAttempt | undefined;
    const outer = createBackGuard({ onBack: (attempt) => { outerAttempt = attempt; } });
    await back();

    let innerAttempt: BackAttempt | undefined;
    const innerAction = vi.fn();
    createBackGuard({ onBack: (attempt) => { innerAttempt = attempt; } });
    await back();

    expect(innerAttempt?.done(innerAction)).toBe(true);
    expect(innerAction).toHaveBeenCalledOnce();
    expect(outerAttempt?.stay()).toBe(true);
    outer.dispose();
  });

  it("runs the final action only after returning to the base entry", async () => {
    const { createBackGuard } = await import("../../src/index");
    target().history.replaceState({ page: "origin" }, "", "/origin");
    target().history.pushState({ page: "protected" }, "", "/protected");
    let attempt: BackAttempt | undefined;
    createBackGuard({ onBack: (value) => { attempt = value; } });
    await back();

    const action = vi.fn(() => target().history.back());
    expect(attempt?.done(action)).toBe(true);
    expect(action).not.toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(action).toHaveBeenCalledOnce();
    expect(target().location.pathname).toBe("/origin");
  });

  it("rejects new guards during final cleanup", async () => {
    const { createBackGuard } = await import("../../src/index");
    let attempt: BackAttempt | undefined;
    createBackGuard({ onBack: (value) => { attempt = value; } });
    await back();

    expect(attempt?.done(vi.fn())).toBe(true);
    expect(() => createBackGuard({ onBack: vi.fn() })).toThrow(
      "final guard is being completed",
    );
    await new Promise((resolve) => setTimeout(resolve, 25));
  });

  it("makes attempts permanently stale after disposal", async () => {
    const { createBackGuard } = await import("../../src/index");
    let attempt: BackAttempt | undefined;
    const guard = createBackGuard({ onBack: (value) => { attempt = value; } });
    await back();
    guard.dispose();
    guard.dispose();

    const action = vi.fn();
    expect(attempt?.stay()).toBe(false);
    expect(attempt?.done(action)).toBe(false);
    expect(action).not.toHaveBeenCalled();
    expect(target().history.state).toBeNull();
  });

  it("re-arms after callback failures and reports them", async () => {
    const { createBackGuard } = await import("../../src/index");
    const error = new Error("dialog failed");
    const onError = vi.fn();
    const onBack = vi.fn().mockRejectedValueOnce(error).mockImplementationOnce(() => undefined);
    const guard = createBackGuard({ onBack, onError });

    await back();
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(error));
    await back();
    expect(onBack).toHaveBeenCalledTimes(2);
    guard.dispose();
  });

  it("re-arms a failed lower attempt while it is suspended", async () => {
    const { createBackGuard } = await import("../../src/index");
    let rejectOuter: ((error: unknown) => void) | undefined;
    const outerCalls = vi.fn();
    const onError = vi.fn();
    const outer = createBackGuard({
      onBack() {
        outerCalls();
        return new Promise<void>((_resolve, reject) => { rejectOuter = reject; });
      },
      onError,
    });
    await back();
    const inner = createBackGuard({ onBack: vi.fn() });

    rejectOuter?.(new Error("late failure"));
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
    inner.dispose();
    await back();
    expect(outerCalls).toHaveBeenCalledTimes(2);
    outer.dispose();
  });

  it("reports action failures without recreating a completed layer", async () => {
    const { createBackGuard } = await import("../../src/index");
    let attempt: BackAttempt | undefined;
    const error = new Error("action failed");
    const onError = vi.fn();
    createBackGuard({ onBack: (value) => { attempt = value; }, onError });
    const inner = createBackGuard({ onBack: vi.fn() });
    inner.dispose();
    await back();

    expect(attempt?.done(() => Promise.reject(error))).toBe(true);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(error));
  });

  it("does not overwrite externally replaced sentinel state", async () => {
    const { createBackGuard } = await import("../../src/index");
    const onError = vi.fn();
    const guard = createBackGuard({ onBack: vi.fn(), onError });
    const external = { route: "external" };
    target().history.replaceState(external, "", "/external");

    guard.dispose();

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("sentinel was replaced") }),
    );
    expect(target().history.state).toEqual(external);
  });
});
