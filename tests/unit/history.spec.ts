import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHistory, type History } from "../../src/history";

const KEY = "__revfanc_guard__";
let dom: JSDOM;

function target(): Window {
  return dom.window as unknown as Window;
}

function installClone(): void {
  const history = dom.window.history;
  const push = history.pushState.bind(history);
  const replace = history.replaceState.bind(history);
  vi.spyOn(history, "pushState").mockImplementation((data, unused, url) => {
    push(structuredClone(data), unused, url);
  });
  vi.spyOn(history, "replaceState").mockImplementation(
    (data, unused, url) => {
      replace(structuredClone(data), unused, url);
    },
  );
}

function changed(history: History): Promise<void> {
  return new Promise((resolve) => history.listen(() => resolve()));
}

beforeEach(() => {
  dom = new JSDOM("<!doctype html><title>History</title>", {
    url: "https://example.test/protected?draft=1#editor",
  });
  installClone();
});

afterEach(() => {
  dom.window.close();
  vi.restoreAllMocks();
});

describe("History", () => {
  it("creates a same-URL active buffer with business state", () => {
    const state: Record<string, unknown> = { route: "editor" };
    const shared = { draft: true };
    state.self = state;
    state.left = shared;
    state.right = shared;
    target().history.replaceState(state, "", target().location.href);
    const initialLength = target().history.length;
    const initialUrl = target().location.href;

    const sentinel = createHistory(target()).create();
    const current = target().history.state as Record<string, unknown>;

    expect(target().history.length).toBe(initialLength + 1);
    expect(target().location.href).toBe(initialUrl);
    expect(sentinel.active()).toBe(true);
    expect(sentinel.base()).toBe(false);
    expect(current[KEY]).toMatch(/^a:o:/);
    expect(current.self).toBe(current);
    expect(current.left).toBe(current.right);
    expect(state).not.toHaveProperty(KEY);
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

    createHistory(target()).create();
    const current = target().history.state as Record<string, unknown>;

    expect(Object.prototype.hasOwnProperty.call(current, "__proto__")).toBe(
      true,
    );
    expect(current["__proto__"]).toEqual({ kept: true });
  });

  it("keeps the base clean and restores null exactly", async () => {
    expect(target().history.state).toBeNull();
    const history = createHistory(target());
    const sentinel = history.create();
    expect(target().history.state).toMatchObject({ [KEY]: expect.any(String) });
    const pop = changed(history);

    sentinel.release();
    expect(history.inactive()).toBe(true);
    await pop;
    expect(sentinel.base()).toBe(true);
    sentinel.settle();

    expect(target().history.state).toBeNull();
  });

  it("copies business changes from the buffer back to the base", async () => {
    const history = createHistory(target());
    const sentinel = history.create();
    const current = target().history.state as Record<string, unknown>;
    current.business = { saved: true };
    target().history.replaceState(current, "", target().location.href);
    const pop = changed(history);

    sentinel.release();
    await pop;
    sentinel.settle();

    expect(target().history.state).toEqual({ business: { saved: true } });
  });

  it("restores the active buffer from the current base state", async () => {
    const history = createHistory(target());
    const sentinel = history.create();
    const pop = changed(history);
    sentinel.release();
    await pop;
    sentinel.settle();
    target().history.replaceState(
      { route: "latest", nested: { saved: true } },
      "",
      target().location.href,
    );

    sentinel.restore();

    expect(sentinel.active()).toBe(true);
    expect(target().history.state).toMatchObject({
      route: "latest",
      nested: { saved: true },
      [KEY]: expect.stringMatching(/^a:/),
    });
  });

  it("adopts active and inactive buffers without pushing again", () => {
    const history = createHistory(target());
    history.create();
    const push = vi.mocked(target().history.pushState);
    const calls = push.mock.calls.length;

    const active = createHistory(target()).create();
    expect(active.active()).toBe(true);
    expect(push).toHaveBeenCalledTimes(calls);

    const state = target().history.state as Record<string, unknown>;
    state[KEY] = String(state[KEY]).replace(/^a:/, "i:");
    target().history.replaceState(state, "", target().location.href);
    const adopted = createHistory(target()).create();

    expect(adopted.active()).toBe(true);
    expect(push).toHaveBeenCalledTimes(calls);
  });

  it.each([1, "state", [], new Date()])(
    "rejects an unsupported root without pushing %#",
    (state) => {
      target().history.replaceState(state, "", target().location.href);
      const push = vi.mocked(target().history.pushState);
      const calls = push.mock.calls.length;

      expect(() => createHistory(target()).create()).toThrow();
      expect(push).toHaveBeenCalledTimes(calls);
    },
  );

  it("rejects an occupied reserved key without changing it", () => {
    const state = { [KEY]: "business", route: "editor" };
    target().history.replaceState(state, "", target().location.href);

    expect(() => createHistory(target()).create()).toThrow();
    expect(target().history.state).toEqual(state);
  });

  it("supports frozen state through the platform clone path", () => {
    target().history.replaceState(
      { route: "editor" },
      "",
      target().location.href,
    );
    const original = target().history.state as Record<string, unknown>;
    Object.freeze(original);

    const sentinel = createHistory(target()).create();

    expect(sentinel.active()).toBe(true);
    expect(original).toEqual({ route: "editor" });
    expect(target().history.state).toMatchObject({
      route: "editor",
      [KEY]: expect.stringMatching(/^a:/),
    });
  });

  it("does not leak the marker when pushState fails", () => {
    target().history.replaceState(
      { route: "editor" },
      "",
      target().location.href,
    );
    const failure = new Error("push failed");
    vi.mocked(target().history.pushState).mockImplementationOnce(() => {
      throw failure;
    });

    expect(() => createHistory(target()).create()).toThrow(failure);
    expect(target().history.state).toEqual({ route: "editor" });
  });

  it("encapsulates recognized popstate interception", () => {
    const history = createHistory(target());
    const observed = vi.fn();
    const later = vi.fn();
    history.listen((intercept) => {
      observed();
      intercept();
    });
    target().addEventListener("popstate", later);

    target().dispatchEvent(new dom.window.PopStateEvent("popstate"));

    expect(observed).toHaveBeenCalledOnce();
    expect(later).not.toHaveBeenCalled();
  });
});
