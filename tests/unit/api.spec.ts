import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BackGuard } from "../../src/types";

const RUNTIME_SYMBOL = Symbol.for("@revfanc/guard.runtime.v2");
const STATE_KEY = "__revfanc_guard__";

let dom: JSDOM;

function target(): Window {
  return dom.window as unknown as Window;
}

function installStructuredCloneHistory(): void {
  const history = dom.window.history;
  const pushState = history.pushState.bind(history);
  const replaceState = history.replaceState.bind(history);

  vi.spyOn(history, "pushState").mockImplementation((data, unused, url) => {
    pushState(structuredClone(data), unused, url);
  });
  vi.spyOn(history, "replaceState").mockImplementation((data, unused, url) => {
    replaceState(structuredClone(data), unused, url);
  });
}

function callResolve(handle: BackGuard, ...args: unknown[]): boolean {
  return (handle.resolve as (...values: unknown[]) => boolean)(...args);
}

beforeEach(() => {
  dom = new JSDOM("<!doctype html><title>Guard API test</title>", {
    url: "https://example.test/protected",
  });
  installStructuredCloneHistory();
  vi.stubGlobal("window", dom.window);
});

afterEach(() => {
  delete (dom.window as unknown as Record<PropertyKey, unknown>)[RUNTIME_SYMBOL];
  dom.window.close();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("public API", () => {
  it("imports without side effects and installs one listener lazily", async () => {
    const addEventListener = vi.spyOn(target(), "addEventListener");
    vi.resetModules();
    const { createBackGuard } = await import("../../src/index");

    expect(addEventListener).not.toHaveBeenCalled();

    const first = createBackGuard({ onBack: vi.fn() });
    const second = createBackGuard({ onBack: vi.fn() });
    const popstateCalls = addEventListener.mock.calls.filter(
      ([eventName]) => eventName === "popstate",
    );
    expect(popstateCalls).toHaveLength(1);
    expect(popstateCalls[0]?.[2]).toBe(true);
    expect(second.resolve()).toBe(true);
    expect(first.resolve()).toBe(true);
  });

  it("is safe to import without a complete browser Window", async () => {
    vi.stubGlobal("window", {});
    vi.resetModules();
    const { createBackGuard } = await import("../../src/index");

    expect(() => createBackGuard({ onBack: vi.fn() })).toThrow(
      "requires a browser with the History API",
    );
  });

  it("validates options before changing history", async () => {
    vi.resetModules();
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

  it("uses overload presence instead of treating undefined as no action", async () => {
    vi.resetModules();
    const { createBackGuard } = await import("../../src/index");
    const guard = createBackGuard({ onBack: vi.fn() });

    expect(() => callResolve(guard, undefined)).toThrow(
      "resolve() accepts no arguments or one action function",
    );
    expect(() => callResolve(guard, null)).toThrow(
      "resolve() accepts no arguments or one action function",
    );
    expect(() => callResolve(guard, vi.fn(), vi.fn())).toThrow(
      "resolve() accepts no arguments or one action function",
    );
    expect(guard.resolve()).toBe(true);
    expect(guard.resolve()).toBe(false);
    expect(() => callResolve(guard, undefined)).toThrow(
      "resolve() accepts no arguments or one action function",
    );
  });

  it("runs a final action from the clean protected base", async () => {
    vi.resetModules();
    const { createBackGuard } = await import("../../src/index");
    target().history.replaceState({ page: "origin" }, "", "/origin");
    target().history.pushState({ page: "protected" }, "", "/protected");
    const observed: Array<{ path: string; marked: boolean }> = [];
    const guard = createBackGuard({ onBack: vi.fn() });

    expect(
      guard.resolve(() => {
        const state = target().history.state as Record<string, unknown>;
        observed.push({
          path: target().location.pathname,
          marked: Object.prototype.hasOwnProperty.call(state, STATE_KEY),
        });
        target().history.back();
      }),
    ).toBe(true);

    await vi.waitFor(() => {
      expect(target().location.pathname).toBe("/origin");
    });
    expect(observed).toEqual([{ path: "/protected", marked: false }]);
  });

  it("recreates during silent cleanup without growing another history entry", async () => {
    vi.resetModules();
    const { createBackGuard } = await import("../../src/index");
    target().history.replaceState({ page: "origin" }, "", "/origin");
    target().history.pushState({ page: "protected" }, "", "/protected");
    const first = createBackGuard({ onBack: vi.fn() });
    const guardedLength = target().history.length;
    const replacementBack = vi.fn();

    expect(first.resolve()).toBe(true);
    const replacement = createBackGuard({ onBack: replacementBack });

    await vi.waitFor(() => {
      expect(target().history.state).toHaveProperty(STATE_KEY);
    });
    expect(target().history.length).toBe(guardedLength);

    target().history.back();
    await vi.waitFor(() => expect(replacementBack).toHaveBeenCalledOnce());
    expect(replacement.resolve()).toBe(true);
  });
});
