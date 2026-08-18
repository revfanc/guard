import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGuard } from "../../src/index";

const windows: JSDOM[] = [];

function target(url = "https://example.test/protected"): Window {
  const dom = new JSDOM("<!doctype html><title>Guard</title>", { url });
  windows.push(dom);
  const history = dom.window.history;
  const push = history.pushState.bind(history);
  const replace = history.replaceState.bind(history);
  vi.spyOn(history, "pushState").mockImplementation((data, unused, next) => {
    push(structuredClone(data), unused, next);
  });
  vi.spyOn(history, "replaceState").mockImplementation(
    (data, unused, next) => {
      replace(structuredClone(data), unused, next);
    },
  );
  return dom.window as unknown as Window;
}

afterEach(() => {
  for (const dom of windows.splice(0)) dom.window.close();
});

describe("public API", () => {
  it("validates the Handler", () => {
    expect(() => createGuard(null as never, target())).toThrow(
      "handler must be a function",
    );
  });

  it("validates the target Window", () => {
    expect(() => createGuard(vi.fn(), {} as Window)).toThrow(
      "target must be a same-origin Window with the History API",
    );
  });

  it("requires a browser when target is omitted", () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
    Reflect.deleteProperty(globalThis, "window");
    try {
      expect(() => createGuard(vi.fn())).toThrow(
        "target must be a same-origin Window with the History API",
      );
    } finally {
      if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
    }
  });

  it("returns one idempotent asynchronous stop function", async () => {
    const stop = createGuard(vi.fn(), target());
    const first = stop();

    expect(stop()).toBe(first);
    await expect(first).resolves.toBeUndefined();
  });

  it("isolates Runtime state by Window", () => {
    const parent = target("https://example.test/parent");
    const frame = target("https://example.test/frame");
    const parentPush = vi.spyOn(parent.history, "pushState");
    const framePush = vi.spyOn(frame.history, "pushState");

    createGuard(vi.fn(), parent);
    createGuard(vi.fn(), parent);
    createGuard(vi.fn(), frame);

    expect(parentPush).toHaveBeenCalledOnce();
    expect(framePush).toHaveBeenCalledOnce();
  });

  it("shares one Runtime across compatible module calls", () => {
    const current = target();
    const push = vi.spyOn(current.history, "pushState");

    createGuard(vi.fn(), current);
    createGuard(vi.fn(), current);

    expect(push).toHaveBeenCalledOnce();
    const symbols = Object.getOwnPropertySymbols(current).filter((symbol) =>
      String(symbol).includes("@revfanc/guard.runtime.v1"),
    );
    expect(symbols).toHaveLength(1);
  });

  it("uses an isolated fallback when the global Runtime slot is occupied", () => {
    const current = target();
    const push = vi.mocked(current.history.pushState);
    Object.defineProperty(
      current,
      Symbol.for("@revfanc/guard.runtime.v1"),
      {
        configurable: false,
        value: { occupied: true },
      },
    );

    createGuard(vi.fn(), current);
    createGuard(vi.fn(), current);

    expect(push).toHaveBeenCalledOnce();
  });
});
