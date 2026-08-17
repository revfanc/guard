import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createHistoryPort,
  type HistoryPort,
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

function nextChange(port: HistoryPort): Promise<void> {
  return new Promise((resolve) => {
    port.listenToPopState(() => resolve());
  });
}

beforeEach(() => {
  dom = new JSDOM("<!doctype html><title>History port test</title>", {
    url: "https://example.test/protected?draft=1#editor",
  });
  installStructuredCloneHistory();
});

afterEach(() => {
  dom.window.close();
  vi.restoreAllMocks();
});

describe("HistoryPort", () => {
  it("creates and releases a same-URL sentinel with business state", () => {
    const state: Record<string, unknown> = { route: "editor" };
    const shared: Record<string, unknown> = { draft: true };
    state.self = state;
    state.left = shared;
    state.right = shared;
    target().history.replaceState(state, "", target().location.href);

    const port = createHistoryPort(target());
    const initialLength = target().history.length;
    const initialUrl = target().location.href;
    const sentinel = port.createSentinel();
    const current = target().history.state as Record<string, unknown>;

    expect(target().history.length).toBe(initialLength + 1);
    expect(target().location.href).toBe(initialUrl);
    expect(sentinel.isCurrent()).toBe(true);
    expect(sentinel.isAtBase()).toBe(false);
    expect(current[STATE_KEY]).toBe(false);
    expect(current.self).toBe(current);
    expect(current.left).toBe(current.right);
    expect(state).not.toHaveProperty(STATE_KEY);

    const back = vi.spyOn(target().history, "back").mockImplementation(() => undefined);
    sentinel.releaseToBase();
    const clean = target().history.state as Record<string, unknown>;

    expect(back).toHaveBeenCalledOnce();
    expect(clean).not.toHaveProperty(STATE_KEY);
    expect(clean.self).toBe(clean);
    expect(clean.left).toBe(clean.right);
    expect(sentinel.isCurrent()).toBe(false);
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

    const sentinel = createHistoryPort(target()).createSentinel();
    const current = target().history.state as Record<string, unknown>;

    expect(Object.prototype.hasOwnProperty.call(current, "__proto__")).toBe(
      true,
    );
    expect(current["__proto__"]).toEqual({ kept: true });

    vi.spyOn(target().history, "back").mockImplementation(() => undefined);
    sentinel.releaseToBase();
    const clean = target().history.state as Record<string, unknown>;

    expect(Object.prototype.hasOwnProperty.call(clean, "__proto__")).toBe(true);
    expect(clean["__proto__"]).toEqual({ kept: true });
  });

  it("restores null exactly when the sentinel has no business fields", () => {
    expect(target().history.state).toBeNull();

    const sentinel = createHistoryPort(target()).createSentinel();
    vi.spyOn(target().history, "back").mockImplementation(() => undefined);
    sentinel.releaseToBase();

    expect(target().history.state).toBeNull();
    expect(sentinel.isCurrent()).toBe(false);
  });

  it("preserves business fields added to a sentinel that began at null", () => {
    const sentinel = createHistoryPort(target()).createSentinel();
    const current = target().history.state as Record<string, unknown>;
    current.route = "external";
    target().history.replaceState(current, "", target().location.href);
    vi.spyOn(target().history, "back").mockImplementation(() => undefined);

    sentinel.releaseToBase();

    expect(target().history.state).toEqual({ route: "external" });
  });

  it("recognizes its base and restores from the current clean state", async () => {
    const port = createHistoryPort(target());
    const sentinel = port.createSentinel();
    const changed = nextChange(port);

    sentinel.releaseToBase();
    await changed;

    expect(sentinel.isAtBase()).toBe(true);
    target().history.replaceState(
      { route: "latest", nested: { saved: true } },
      "",
      target().location.href,
    );
    sentinel.restoreAtBase();

    expect(sentinel.isCurrent()).toBe(true);
    expect(target().history.state).toMatchObject({
      route: "latest",
      nested: { saved: true },
    });
  });

  it("adopts a current sentinel without pushing another entry", () => {
    const port = createHistoryPort(target());
    const first = port.createSentinel();
    const marker = (target().history.state as Record<string, unknown>)[STATE_KEY];
    const length = target().history.length;
    const pushState = vi.mocked(target().history.pushState);
    const calls = pushState.mock.calls.length;

    const adopted = createHistoryPort(target()).createSentinel();

    expect(first.isCurrent()).toBe(true);
    expect(adopted.isCurrent()).toBe(true);
    expect(target().history.length).toBe(length);
    expect(pushState).toHaveBeenCalledTimes(calls);
    expect((target().history.state as Record<string, unknown>)[STATE_KEY]).toBe(
      marker,
    );
    expect(marker).toBe(true);
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

    expect(() => createHistoryPort(target()).createSentinel()).toThrow();
    expect(pushState).toHaveBeenCalledTimes(calls);
  });

  it("copies a non-extensible plain-object root", () => {
    target().history.replaceState({ route: "editor" }, "", target().location.href);
    const state = target().history.state as Record<string, unknown>;
    Object.freeze(state);
    const pushState = vi.mocked(target().history.pushState);
    const calls = pushState.mock.calls.length;

    const sentinel = createHistoryPort(target()).createSentinel();

    expect(sentinel.isCurrent()).toBe(true);
    expect(state).toEqual({ route: "editor" });
    expect(pushState).toHaveBeenCalledTimes(calls + 1);
    expect(target().history.state).toEqual({
      route: "editor",
      [STATE_KEY]: false,
    });
  });

  it("releases a frozen sentinel without changing its state graph", () => {
    const state: Record<string, unknown> = { route: "editor" };
    state.self = state;
    target().history.replaceState(state, "", target().location.href);
    const sentinel = createHistoryPort(target()).createSentinel();
    Object.freeze(target().history.state);
    vi.spyOn(target().history, "back").mockImplementation(() => undefined);

    sentinel.releaseToBase();
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

    expect(() => createHistoryPort(target()).createSentinel()).toThrow(failure);
    expect(target().history.state).toEqual({ route: "editor" });
    expect(target().history.state).not.toHaveProperty(STATE_KEY);
  });

  it("keeps the current sentinel when clear replaceState fails", () => {
    const sentinel = createHistoryPort(target()).createSentinel();
    const failure = new Error("replace failed");
    vi.mocked(target().history.replaceState).mockImplementationOnce(() => {
      throw failure;
    });

    expect(() => sentinel.releaseToBase()).toThrow(failure);
    expect(sentinel.isCurrent()).toBe(true);
  });

  it("does not clear an externally replaced sentinel", () => {
    const sentinel = createHistoryPort(target()).createSentinel();
    const external = { route: "external", nested: { saved: true } };
    target().history.replaceState(external, "", "/external#kept");

    expect(sentinel.isCurrent()).toBe(false);
    expect(() => sentinel.releaseToBase()).toThrow("sentinel was replaced");
    expect(target().location.href).toBe("https://example.test/external#kept");
    expect(target().history.state).toEqual(external);
  });

  it("does not restore over an externally replaced sentinel", () => {
    const sentinel = createHistoryPort(target()).createSentinel();
    const external = { route: "external" };
    target().history.replaceState(external, "", "/external");

    expect(sentinel.isAtBase()).toBe(false);
    expect(() => sentinel.restoreAtBase()).toThrow("sentinel was replaced");
    expect(target().history.state).toEqual(external);
    expect(target().location.href).toBe("https://example.test/external");
  });

  it("fails closed when history.back throws synchronously", () => {
    const sentinel = createHistoryPort(target()).createSentinel();
    const failure = new Error("back failed");
    vi.spyOn(target().history, "back").mockImplementation(() => {
      throw failure;
    });

    expect(() => sentinel.releaseToBase()).toThrow(failure);

    expect(sentinel.isCurrent()).toBe(false);
    expect(target().history.state).toBeNull();
  });

  it("does not roll back over state replaced by a throwing back call", () => {
    const sentinel = createHistoryPort(target()).createSentinel();
    const external = { route: "external" };
    vi.spyOn(target().history, "back").mockImplementation(() => {
      target().history.replaceState(external, "", "/external");
      throw new Error("back failed after replacement");
    });

    expect(() => sentinel.releaseToBase()).toThrow(
      "back failed after replacement",
    );
    expect(target().history.state).toEqual(external);
    expect(target().location.href).toBe("https://example.test/external");
  });

  it("encapsulates popstate interception", () => {
    const port = createHistoryPort(target());
    const observed = vi.fn();
    const later = vi.fn();
    port.listenToPopState((intercept) => {
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
