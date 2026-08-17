import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BackAttempt } from "../../src/types";

const RUNTIME_SYMBOL = Symbol.for("@revfanc/guard.runtime.v3");
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
    const first = createBackGuard(vi.fn());
    const second = createBackGuard(vi.fn());
    const popstateCalls = addEventListener.mock.calls.filter(
      ([eventName]) => eventName === "popstate",
    );

    expect(popstateCalls).toHaveLength(1);
    expect(popstateCalls[0]?.[2]).toBe(true);
    await second.dispose();
    await first.dispose();
  });

  it("is safe to import without a complete browser Window", async () => {
    vi.stubGlobal("window", {});
    vi.resetModules();
    const { createBackGuard } = await import("../../src/index");

    expect(() => createBackGuard(vi.fn())).toThrow(
      "requires a browser with the History API",
    );
  });

  it("validates the handler before changing history", async () => {
    vi.resetModules();
    const { createBackGuard } = await import("../../src/index");
    const initialLength = target().history.length;

    expect(() => createBackGuard(null as never)).toThrow(
      "onBack must be a function",
    );
    expect(() => createBackGuard({ onBack: vi.fn() } as never)).toThrow(
      "onBack must be a function",
    );
    expect(target().history.length).toBe(initialLength);
  });

  it("continues the original Back after allow", async () => {
    vi.resetModules();
    const { createBackGuard } = await import("../../src/index");
    target().history.replaceState({ page: "origin" }, "", "/origin");
    target().history.pushState({ page: "protected" }, "", "/protected");
    let attempt: BackAttempt | undefined;
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const guard = createBackGuard((current) => {
      attempt = current;
      return pending;
    });

    target().history.back();
    await vi.waitFor(() => expect(attempt).toBeDefined());
    expect(attempt?.allow()).toBe(true);
    await vi.waitFor(() => {
      expect(target().location.pathname).toBe("/origin");
    });
    await guard.dispose();
    finish();
  });

  it("re-arms when a handler completes without allow", async () => {
    vi.resetModules();
    const { createBackGuard } = await import("../../src/index");
    target().history.replaceState({ page: "origin" }, "", "/origin");
    target().history.pushState({ page: "protected" }, "", "/protected");
    const onBack = vi.fn();
    const guard = createBackGuard(onBack);

    target().history.back();
    await vi.waitFor(() => expect(onBack).toHaveBeenCalledOnce());
    target().history.back();
    await vi.waitFor(() => expect(onBack).toHaveBeenCalledTimes(2));
    expect(target().location.pathname).toBe("/protected");

    await guard.dispose();
  });

  it("reports handler errors through the target window", async () => {
    const reportError = vi.fn();
    Object.defineProperty(target(), "reportError", {
      configurable: true,
      value: reportError,
    });
    vi.resetModules();
    const { createBackGuard } = await import("../../src/index");
    target().history.replaceState({ page: "origin" }, "", "/origin");
    target().history.pushState({ page: "protected" }, "", "/protected");
    const error = new Error("handler failed");
    const guard = createBackGuard(() => {
      throw error;
    });

    target().history.back();
    await vi.waitFor(() => expect(reportError).toHaveBeenCalledWith(error));
    await guard.dispose();
  });

  it("recreates during disposal without growing another history entry", async () => {
    vi.resetModules();
    const { createBackGuard } = await import("../../src/index");
    target().history.replaceState({ page: "origin" }, "", "/origin");
    target().history.pushState({ page: "protected" }, "", "/protected");
    const first = createBackGuard(vi.fn());
    const guardedLength = target().history.length;
    const replacementBack = vi.fn();

    const disposed = first.dispose();
    const replacement = createBackGuard(replacementBack);
    await disposed;
    await vi.waitFor(() => {
      expect(target().history.state).toHaveProperty(STATE_KEY);
    });
    expect(target().history.length).toBe(guardedLength);

    target().history.back();
    await vi.waitFor(() => expect(replacementBack).toHaveBeenCalledOnce());
    await replacement.dispose();
  });

  it("makes active navigation safe after awaited disposal", async () => {
    vi.resetModules();
    const { createBackGuard } = await import("../../src/index");
    const guard = createBackGuard(vi.fn());

    await guard.dispose();
    expect(
      target().history.state === null ||
        !Object.prototype.hasOwnProperty.call(
          target().history.state,
          STATE_KEY,
        ),
    ).toBe(true);
    target().history.pushState({ page: "next" }, "", "/next");
    expect(target().location.pathname).toBe("/next");
  });
});
