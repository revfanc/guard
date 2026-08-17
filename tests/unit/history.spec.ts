import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createHistory,
  type Adapter,
} from "../../src/history";

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

function nextChange(history: Adapter): Promise<void> {
  return new Promise((resolve) => {
    history.listen(() => resolve());
  });
}

beforeEach(() => {
  dom = new JSDOM("<!doctype html><title>History adapter test</title>", {
    url: "https://example.test/protected?draft=1#editor",
  });
  installStructuredCloneHistory();
});

afterEach(() => {
  dom.window.close();
  vi.restoreAllMocks();
});

describe("History", () => {
  it("creates and releases a same-URL sentinel with business state", () => {
    const state: Record<string, unknown> = { route: "editor" };
    const shared: Record<string, unknown> = { draft: true };
    state.self = state;
    state.left = shared;
    state.right = shared;
    target().history.replaceState(state, "", target().location.href);

    const history = createHistory(target());
    const initialLength = target().history.length;
    const initialUrl = target().location.href;
    const sentinel = history.create();
    const current = target().history.state as Record<string, unknown>;

    expect(target().history.length).toBe(initialLength + 1);
    expect(target().location.href).toBe(initialUrl);
    expect(sentinel.current()).toBe(true);
    expect(sentinel.base()).toBe(false);
    expect(current[STATE_KEY]).toMatch(/^s:o:/);
    expect(current.self).toBe(current);
    expect(current.left).toBe(current.right);
    expect(state).not.toHaveProperty(STATE_KEY);

    const back = vi.spyOn(target().history, "back").mockImplementation(() => undefined);
    sentinel.release();
    const clean = target().history.state as Record<string, unknown>;

    expect(back).toHaveBeenCalledOnce();
    expect(clean).not.toHaveProperty(STATE_KEY);
    expect(clean.self).toBe(clean);
    expect(clean.left).toBe(clean.right);
    expect(sentinel.current()).toBe(false);
  });

  it("preserves an own __proto__ business field", () => {
    const state: Record<string, unknown> = { route: "editor" };
    Object.defineProperty(state, "__proto__", {
      configurable: true,
      enumerable: true,
      value: { kept: true },
      writable: true,
    });
    target().history.replaceState(state, "", target().location.href);

    const sentinel = createHistory(target()).create();
    const current = target().history.state as Record<string, unknown>;

    expect(Object.prototype.hasOwnProperty.call(current, "__proto__")).toBe(
      true,
    );
    expect(current["__proto__"]).toEqual({ kept: true });

    vi.spyOn(target().history, "back").mockImplementation(() => undefined);
    sentinel.release();
    const clean = target().history.state as Record<string, unknown>;

    expect(Object.prototype.hasOwnProperty.call(clean, "__proto__")).toBe(true);
    expect(clean["__proto__"]).toEqual({ kept: true });
  });

  it("restores null exactly when the sentinel has no business fields", () => {
    expect(target().history.state).toBeNull();

    const sentinel = createHistory(target()).create();
    vi.spyOn(target().history, "back").mockImplementation(() => undefined);
    sentinel.release();

    expect(target().history.state).toBeNull();
    expect(sentinel.current()).toBe(false);
  });

  it("preserves the latest sentinel state on the settled base", async () => {
    const sentinel = createHistory(target()).create();
    const current = target().history.state as Record<string, unknown>;
    current.route = "external";
    target().history.replaceState(current, "", target().location.href);
    const changed = nextChange(createHistory(target()));

    sentinel.release();
    await changed;
    sentinel.settle();

    expect(target().history.state).toEqual({ route: "external" });
  });

  it("recognizes its exact base and restores from its latest business state", async () => {
    const history = createHistory(target());
    const sentinel = history.create();
    const changed = nextChange(history);

    target().history.back();
    await changed;

    expect(sentinel.base()).toBe(true);
    const base = target().history.state as Record<string, unknown>;
    target().history.replaceState(
      { ...base, route: "latest", nested: { saved: true } },
      "",
      target().location.href,
    );
    sentinel.restore();

    expect(sentinel.current()).toBe(true);
    expect(target().history.state).toMatchObject({
      route: "latest",
      nested: { saved: true },
    });
  });

  it("restores a current-protocol sentinel without pushing another entry", () => {
    const history = createHistory(target());
    const first = history.create();
    const marker = (target().history.state as Record<string, unknown>)[STATE_KEY];
    const length = target().history.length;
    const pushState = vi.mocked(target().history.pushState);
    const calls = pushState.mock.calls.length;

    const restored = createHistory(target()).create();

    expect(first.current()).toBe(true);
    expect(restored.current()).toBe(true);
    expect(target().history.length).toBe(length);
    expect(pushState).toHaveBeenCalledTimes(calls);
    expect((target().history.state as Record<string, unknown>)[STATE_KEY]).toBe(
      marker,
    );
    expect(marker).toMatch(/^s:n:/);
  });

  it("rejects an occupied reserved key", () => {
    target().history.replaceState(
      { route: "editor", [STATE_KEY]: true },
      "",
      target().location.href,
    );

    expect(() => createHistory(target()).create()).toThrow("reserved guard key");
    expect(target().history.state).toEqual({
      route: "editor",
      [STATE_KEY]: true,
    });
  });

  it("does not mistake an older same-URL entry for its exact base", async () => {
    target().history.replaceState({ step: 0 }, "", "/same");
    target().history.pushState({ step: 1 }, "", "/same");
    const history = createHistory(target());
    const sentinel = history.create();
    const changed = nextChange(history);

    target().history.go(-2);
    await changed;

    expect(sentinel.base()).toBe(false);
    expect(() => sentinel.restore()).toThrow("sentinel was replaced");
    expect(target().history.state).toEqual({ step: 0 });
  });

  it.each([
    1,
    "state",
    [],
    new Date(),
  ])("rejects an unsupported root before pushing %#", (state) => {
    target().history.replaceState(state, "", target().location.href);
    const pushState = vi.mocked(target().history.pushState);
    const calls = pushState.mock.calls.length;

    expect(() => createHistory(target()).create()).toThrow();
    expect(pushState).toHaveBeenCalledTimes(calls);
  });

  it("copies a non-extensible plain-object root", () => {
    target().history.replaceState({ route: "editor" }, "", target().location.href);
    const state = target().history.state as Record<string, unknown>;
    Object.freeze(state);
    const pushState = vi.mocked(target().history.pushState);
    const calls = pushState.mock.calls.length;

    const sentinel = createHistory(target()).create();

    expect(sentinel.current()).toBe(true);
    expect(state).toEqual({ route: "editor" });
    expect(pushState).toHaveBeenCalledTimes(calls + 1);
    expect(target().history.state).toEqual({
      route: "editor",
      [STATE_KEY]: expect.stringMatching(/^s:o:/),
    });
  });

  it("releases a frozen sentinel without changing its state graph", () => {
    const state: Record<string, unknown> = { route: "editor" };
    state.self = state;
    target().history.replaceState(state, "", target().location.href);
    const sentinel = createHistory(target()).create();
    Object.freeze(target().history.state);
    vi.spyOn(target().history, "back").mockImplementation(() => undefined);

    sentinel.release();
    const clean = target().history.state as Record<string, unknown>;

    expect(clean).not.toHaveProperty(STATE_KEY);
    expect(clean.self).toBe(clean);
  });

  it("does not leak its reserved key when pushState fails", () => {
    target().history.replaceState({ route: "editor" }, "", target().location.href);
    const failure = new Error("push failed");
    vi.mocked(target().history.pushState).mockImplementationOnce(() => {
      throw failure;
    });

    expect(() => createHistory(target()).create()).toThrow(failure);
    expect(target().history.state).toEqual({ route: "editor" });
    expect(target().history.state).not.toHaveProperty(STATE_KEY);
  });

  it("keeps the current sentinel when clear replaceState fails", () => {
    const sentinel = createHistory(target()).create();
    const failure = new Error("replace failed");
    vi.mocked(target().history.replaceState).mockImplementationOnce(() => {
      throw failure;
    });

    expect(() => sentinel.release()).toThrow(failure);
    expect(sentinel.current()).toBe(true);
  });

  it("does not clear an externally replaced sentinel", () => {
    const sentinel = createHistory(target()).create();
    const external = { route: "external", nested: { saved: true } };
    target().history.replaceState(external, "", "/external#kept");

    expect(sentinel.current()).toBe(false);
    expect(() => sentinel.release()).toThrow("sentinel was replaced");
    expect(target().location.href).toBe("https://example.test/external#kept");
    expect(target().history.state).toEqual(external);
  });

  it("does not restore over an externally replaced sentinel", () => {
    const sentinel = createHistory(target()).create();
    const external = { route: "external" };
    target().history.replaceState(external, "", "/external");

    expect(sentinel.base()).toBe(false);
    expect(() => sentinel.restore()).toThrow("sentinel was replaced");
    expect(target().history.state).toEqual(external);
    expect(target().location.href).toBe("https://example.test/external");
  });

  it("fails closed when history.back throws synchronously", () => {
    const sentinel = createHistory(target()).create();
    const failure = new Error("back failed");
    vi.spyOn(target().history, "back").mockImplementation(() => {
      throw failure;
    });

    expect(() => sentinel.release()).toThrow(failure);

    expect(sentinel.current()).toBe(false);
    expect(target().history.state).toBeNull();
  });

  it("does not roll back over state replaced by a throwing back call", () => {
    const sentinel = createHistory(target()).create();
    const external = { route: "external" };
    vi.spyOn(target().history, "back").mockImplementation(() => {
      target().history.replaceState(external, "", "/external");
      throw new Error("back failed after replacement");
    });

    expect(() => sentinel.release()).toThrow(
      "back failed after replacement",
    );
    expect(target().history.state).toEqual(external);
    expect(target().location.href).toBe("https://example.test/external");
  });

  it("encapsulates popstate interception", () => {
    const history = createHistory(target());
    const observed = vi.fn();
    const later = vi.fn();
    history.listen((intercept) => {
      observed();
      intercept();
    });
    target().addEventListener("popstate", later);

    target().dispatchEvent(
      new dom.window.PopStateEvent("popstate", { state: { route: "base" } }),
    );
    expect(observed).toHaveBeenCalledOnce();
    expect(later).not.toHaveBeenCalled();

  });

});
