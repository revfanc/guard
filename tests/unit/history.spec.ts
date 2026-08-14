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

function nextChange(port: HistoryPort): Promise<unknown> {
  return new Promise((resolve) => {
    port.listen(resolve);
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
  it("creates and releases a same-URL sentinel without changing the graph", () => {
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
    expect(sentinel.matches(current)).toBe(true);
    expect(sentinel.isCurrent()).toBe(true);
    expect(sentinel.isAtBase(current)).toBe(false);
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
    expect(sentinel.isCurrent()).toBe(false);
  });

  it("restores null exactly when the sentinel has no business fields", () => {
    expect(target().history.state).toBeNull();

    const sentinel = createHistoryPort(target()).createSentinel();
    vi.spyOn(target().history, "back").mockImplementation(() => undefined);
    sentinel.release();

    expect(target().history.state).toBeNull();
    expect(sentinel.isCurrent()).toBe(false);
  });

  it("preserves business fields added to a sentinel that began at null", () => {
    const sentinel = createHistoryPort(target()).createSentinel();
    const current = target().history.state as Record<string, unknown>;
    current.route = "external";
    target().history.replaceState(current, "", target().location.href);
    vi.spyOn(target().history, "back").mockImplementation(() => undefined);

    sentinel.release();

    expect(target().history.state).toEqual({ route: "external" });
  });

  it("recognizes its base and restores from the current clean state", async () => {
    const port = createHistoryPort(target());
    const sentinel = port.createSentinel();
    const changed = nextChange(port);

    sentinel.release();
    const change = await changed;

    expect(sentinel.isAtBase(change)).toBe(true);
    target().history.replaceState(
      { route: "latest", nested: { saved: true } },
      "",
      target().location.href,
    );
    sentinel.restore(change);

    expect(sentinel.isCurrent()).toBe(true);
    expect(target().history.state).toMatchObject({
      route: "latest",
      nested: { saved: true },
    });
  });

  it("does not treat foreign, malformed, or accessor markers as its own", () => {
    const sentinel = createHistoryPort(target()).createSentinel();
    const current = target().history.state as Record<string, unknown>;
    const marker = String(current[STATE_KEY]);
    const getter = vi.fn(() => marker);
    const accessorState: Record<string, unknown> = {};
    Object.defineProperty(accessorState, STATE_KEY, {
      configurable: true,
      enumerable: true,
      get: getter,
    });

    expect(sentinel.matches({ [STATE_KEY]: marker.replace(":n:", ":o:") })).toBe(false);
    expect(sentinel.matches({ [STATE_KEY]: "malformed" })).toBe(false);
    expect(sentinel.matches(accessorState)).toBe(false);
    expect(sentinel.isAtBase(accessorState)).toBe(false);
    expect(getter).not.toHaveBeenCalled();
  });

  it.each([
    1,
    "state",
    [],
    new Date(),
    { [STATE_KEY]: { application: true } },
  ])("rejects an unsupported or reserved root before pushing %#", (state) => {
    target().history.replaceState(state, "", target().location.href);
    const pushState = vi.mocked(target().history.pushState);
    const calls = pushState.mock.calls.length;

    expect(() => createHistoryPort(target()).createSentinel()).toThrow();
    expect(pushState).toHaveBeenCalledTimes(calls);
  });

  it("rejects a non-extensible plain-object root before pushing", () => {
    target().history.replaceState({ route: "editor" }, "", target().location.href);
    Object.freeze(target().history.state);
    const pushState = vi.mocked(target().history.pushState);
    const calls = pushState.mock.calls.length;

    expect(() => createHistoryPort(target()).createSentinel()).toThrow(
      "history.state must be extensible",
    );
    expect(pushState).toHaveBeenCalledTimes(calls);
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

  it("restores the marker in memory when clear replaceState fails", () => {
    const sentinel = createHistoryPort(target()).createSentinel();
    const failure = new Error("replace failed");
    vi.mocked(target().history.replaceState).mockImplementationOnce(() => {
      throw failure;
    });

    expect(() => sentinel.release()).toThrow(failure);
    expect(sentinel.isCurrent()).toBe(true);
  });

  it("does not clear an externally replaced sentinel", () => {
    const sentinel = createHistoryPort(target()).createSentinel();
    const external = { route: "external", nested: { saved: true } };
    target().history.replaceState(external, "", "/external#kept");

    expect(sentinel.isCurrent()).toBe(false);
    expect(() => sentinel.release()).toThrow("sentinel was replaced");
    expect(target().location.href).toBe("https://example.test/external#kept");
    expect(target().history.state).toEqual(external);
  });

  it("rolls back its marker when history.back throws synchronously", () => {
    const sentinel = createHistoryPort(target()).createSentinel();
    const failure = new Error("back failed");
    vi.spyOn(target().history, "back").mockImplementation(() => {
      throw failure;
    });

    expect(() => sentinel.release()).toThrow(failure);

    expect(sentinel.isCurrent()).toBe(true);
  });

  it("does not roll back over state replaced by a throwing back call", () => {
    const sentinel = createHistoryPort(target()).createSentinel();
    const external = { route: "external" };
    vi.spyOn(target().history, "back").mockImplementation(() => {
      target().history.replaceState(external, "", "/external");
      throw new Error("back failed after replacement");
    });

    expect(() => sentinel.release()).toThrow("back failed after replacement");
    expect(target().history.state).toEqual(external);
    expect(target().location.href).toBe("https://example.test/external");
  });

  it("fails closed if marker rollback itself throws", () => {
    const sentinel = createHistoryPort(target()).createSentinel();
    const failure = new Error("back failed");
    vi.spyOn(target().history, "back").mockImplementation(() => {
      vi.mocked(target().history.replaceState).mockImplementationOnce(() => {
        throw new Error("rollback failed");
      });
      throw failure;
    });

    expect(() => sentinel.release()).toThrow(failure);
    expect(sentinel.isCurrent()).toBe(false);
    expect(target().history.state).toBeNull();
  });

  it("encapsulates popstate interception", () => {
    const port = createHistoryPort(target());
    const observed = vi.fn();
    const later = vi.fn();
    port.listen((state, intercept) => {
      observed(state);
      intercept();
    });
    target().addEventListener("popstate", later);

    target().dispatchEvent(
      new dom.window.PopStateEvent("popstate", { state: { route: "base" } }),
    );
    expect(observed).toHaveBeenCalledWith({ route: "base" });
    expect(later).not.toHaveBeenCalled();

  });

  it("reports through the target window when a reporter is available", () => {
    const reportError = vi.fn();
    Object.defineProperty(target(), "reportError", {
      configurable: true,
      value: reportError,
    });
    const error = new Error("reported");

    createHistoryPort(target()).report(error);

    expect(reportError).toHaveBeenCalledOnce();
    expect(reportError).toHaveBeenCalledWith(error);
  });
});
