import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BackAttempt } from "../../src/types";

const managerSymbol = Symbol.for("@revfanc/guard.manager");

let dom: JSDOM;

function browserWindow(): Window {
  return dom.window as unknown as Window;
}

async function traverseBack(): Promise<void> {
  browserWindow().history.back();
  await new Promise((resolve) => setTimeout(resolve, 20));
}

beforeEach(() => {
  dom = new JSDOM("<!doctype html><title>Guard test</title>", {
    url: "https://example.test/current",
  });
  vi.stubGlobal("window", dom.window);
});

afterEach(() => {
  delete (dom.window as unknown as Record<PropertyKey, unknown>)[managerSymbol];
  dom.window.close();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("createBackGuard", () => {
  it("adds one sentinel and preserves router state fields", async () => {
    const { createBackGuard } = await import("../../src/index");
    const target = browserWindow();
    target.history.replaceState(
      { position: 4, idx: 3, key: "route-key", usr: { draft: true } },
      "",
      target.location.href,
    );

    const initialLength = target.history.length;
    const guard = createBackGuard({ onBack: vi.fn() });

    expect(target.history.length).toBe(initialLength + 1);
    expect(target.history.state).toMatchObject({
      position: 4,
      idx: 3,
      key: "route-key",
      usr: { draft: true },
    });
    expect(guard.status).toBe("armed");

    guard.dispose();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(guard.status).toBe("disposed");
  });

  it("locks repeated callbacks until the current attempt is reset", async () => {
    const { createBackGuard } = await import("../../src/index");
    const attempts: BackAttempt[] = [];
    const guard = createBackGuard({
      onBack(attempt) {
        attempts.push(attempt);
      },
    });

    await traverseBack();
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.source).toBe("history");
    expect(guard.status).toBe("triggered");

    await traverseBack();
    expect(attempts).toHaveLength(1);

    expect(attempts[0]?.reset()).toBe(true);
    expect(guard.status).toBe("armed");
    await traverseBack();
    expect(attempts).toHaveLength(2);
    expect(attempts[0]?.leave()).toBe(false);

    guard.dispose();
  });

  it("cascades one attempt through nested guards in LIFO order", async () => {
    const { createBackGuard } = await import("../../src/index");
    const calls: string[] = [];
    let outerAttempt: BackAttempt | undefined;
    let innerAttempt: BackAttempt | undefined;

    const outer = createBackGuard({
      onBack(attempt) {
        calls.push(`outer:${attempt.source}`);
        outerAttempt = attempt;
      },
    });
    const inner = createBackGuard({
      onBack(attempt) {
        calls.push(`inner:${attempt.source}`);
        innerAttempt = attempt;
      },
    });

    await traverseBack();
    expect(calls).toEqual(["inner:history"]);
    expect(innerAttempt?.leave()).toBe(true);
    expect(calls).toEqual(["inner:history", "outer:cascade"]);
    expect(inner.status).toBe("disposed");

    expect(outerAttempt?.leave()).toBe(true);
    expect(outer.status).toBe("disposed");
    await new Promise((resolve) => setTimeout(resolve, 30));
  });

  it("disposes any stack layer without cascading a pending attempt", async () => {
    const { createBackGuard } = await import("../../src/index");
    const outerBack = vi.fn();
    const innerBack = vi.fn();
    const outer = createBackGuard({ onBack: outerBack });
    const inner = createBackGuard({ onBack: innerBack });

    outer.dispose();
    await traverseBack();
    expect(innerBack).toHaveBeenCalledOnce();
    expect(outerBack).not.toHaveBeenCalled();

    inner.dispose();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(outer.status).toBe("disposed");
    expect(inner.status).toBe("disposed");
  });

  it("restores primitive state when the final guard is disposed", async () => {
    const { createBackGuard } = await import("../../src/index");
    const target = browserWindow();
    target.history.replaceState("original-state", "", target.location.href);
    const guard = createBackGuard({ onBack: vi.fn() });

    expect(target.history.state).not.toBe("original-state");
    guard.dispose();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(target.history.state).toBe("original-state");
  });

  it("removes the sentinel without leaving when no previous entry exists", async () => {
    const { createBackGuard } = await import("../../src/index");
    const target = browserWindow();
    let attempt: BackAttempt | undefined;
    createBackGuard({
      onBack(value) {
        attempt = value;
      },
    });

    await traverseBack();
    expect(attempt?.leave()).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(target.location.pathname).toBe("/current");
    expect(target.history.state).toBeNull();
  });

  it("keeps the attempt locked and reports callback failures", async () => {
    const { createBackGuard } = await import("../../src/index");
    const error = new Error("dialog failed");
    const onError = vi.fn();
    const guard = createBackGuard({
      onBack: async () => {
        throw error;
      },
      onError,
    });

    await traverseBack();
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(error));
    expect(guard.status).toBe("triggered");
    guard.dispose();
  });

  it("hides synthetic popstate events from later application listeners", async () => {
    const { createBackGuard } = await import("../../src/index");
    const target = browserWindow();
    const applicationListener = vi.fn();
    const guard = createBackGuard({ onBack: vi.fn() });
    target.addEventListener("popstate", applicationListener);

    await traverseBack();
    expect(applicationListener).not.toHaveBeenCalled();
    guard.dispose();
  });

  it("shares a manager across separately evaluated module instances", async () => {
    const firstModule = await import("../../src/index");
    const first = firstModule.createBackGuard({ onBack: vi.fn() });
    const lengthAfterFirst = browserWindow().history.length;

    vi.resetModules();
    const secondModule = await import("../../src/index");
    const second = secondModule.createBackGuard({ onBack: vi.fn() });

    expect(browserWindow().history.length).toBe(lengthAfterFirst);
    second.dispose();
    first.dispose();
  });

  it("is safe to import during SSR and rejects browser-only creation", async () => {
    vi.stubGlobal("window", undefined);
    vi.resetModules();
    const { createBackGuard, isBackGuardSupported } = await import("../../src/index");

    expect(isBackGuardSupported()).toBe(false);
    expect(() => createBackGuard({ onBack: vi.fn() })).toThrow(
      "can only run in a browser",
    );
  });
});
