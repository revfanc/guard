import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGuard } from "../../src/index";

const windows: JSDOM[] = [];

function browser(): Window {
  const dom = new JSDOM("<!doctype html><title>Guard</title>", {
    url: "https://example.test/protected",
  });
  windows.push(dom);
  vi.stubGlobal("window", dom.window);
  return dom.window as unknown as Window;
}

afterEach(() => {
  vi.unstubAllGlobals();
  for (const dom of windows.splice(0)) dom.window.close();
});

describe("public API", () => {
  it("validates the Handler", () => {
    expect(() => createGuard(null as never)).toThrow(
      "handler must be a function",
    );
  });

  it("requires the browser History API", () => {
    vi.stubGlobal("window", undefined);
    expect(() => createGuard(vi.fn())).toThrow(
      "browser History API is unavailable",
    );
  });

  it("creates one same-URL buffer", () => {
    const target = browser();
    const push = vi.spyOn(target.history, "pushState");
    const url = target.location.href;

    const stop = createGuard(vi.fn());

    expect(stop).toBeTypeOf("function");
    expect(push).toHaveBeenCalledOnce();
    expect(target.location.href).toBe(url);
    expect(target.history.state).toMatchObject({
      __revfanc_guard__: expect.stringMatching(/^a:/),
    });
  });
});
