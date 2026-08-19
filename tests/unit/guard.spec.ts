import { beforeEach, describe, expect, it, vi } from "vitest";
import { Controller } from "../../src/guard";

const KEY = "__revfanc_guard__";

function copy<T>(value: T): T {
  return structuredClone(value);
}

class Fake {
  readonly back = vi.fn();
  readonly push = vi.fn((state: unknown, _unused: string, url?: string | URL | null) => {
    this.state = copy(state);
    if (url) this.location.href = new URL(String(url), this.location.href).href;
  });
  readonly remove = vi.fn();
  readonly replace = vi.fn((state: unknown, _unused: string, url?: string | URL | null) => {
    this.state = copy(state);
    if (url) this.location.href = new URL(String(url), this.location.href).href;
  });
  readonly report = vi.fn();
  readonly location = { href: "https://example.test/protected?draft=1#editor" };
  readonly target: Window;
  state: unknown = null;
  private listener?: (event: PopStateEvent) => void;

  constructor() {
    const state = (): unknown => this.state;
    this.target = {
      addEventListener: vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
        this.listener = listener as (event: PopStateEvent) => void;
      }),
      history: {
        back: this.back,
        get state() {
          return state();
        },
        pushState: this.push,
        replaceState: this.replace,
      },
      location: this.location,
      removeEventListener: this.remove,
      reportError: this.report,
      setTimeout: vi.fn(),
    } as unknown as Window;
  }

  pop(state: unknown, url = this.location.href): ReturnType<typeof vi.fn> {
    this.state = copy(state);
    this.location.href = url;
    const stop = vi.fn();
    this.listener?.({ stopImmediatePropagation: stop } as unknown as PopStateEvent);
    return stop;
  }
}

function deferred(): { promise: Promise<void>; resolve(): void } {
  let resolve!: () => void;
  const promise = new Promise<void>((current) => {
    resolve = current;
  });
  return { promise, resolve };
}

let fake: Fake;
let controller: Controller;

beforeEach(() => {
  fake = new Fake();
  controller = new Controller(fake.target);
});

describe("Controller", () => {
  it("creates a tagged buffer with ordinary business state", () => {
    fake.state = { position: 4, route: "/editor" };
    const base = copy(fake.state);

    controller.start(vi.fn());

    expect(fake.push).toHaveBeenCalledOnce();
    expect(fake.state).toMatchObject({
      position: 4,
      route: "/editor",
      [KEY]: expect.stringMatching(/^a:o:/),
    });
    expect(base).toEqual({ position: 4, route: "/editor" });
  });

  it("adopts a refreshed buffer without pushing again", () => {
    controller.start(vi.fn());
    const state = copy(fake.state);
    fake.push.mockClear();

    const refreshed = new Controller(fake.target);
    refreshed.start(vi.fn());

    expect(fake.push).not.toHaveBeenCalled();
    expect(fake.state).toEqual(state);
  });

  it("replaces the current Handler without adding another buffer", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const stopFirst = controller.start(first);
    fake.push.mockClear();
    controller.start(second);

    await expect(stopFirst()).resolves.toBeUndefined();
    expect(fake.push).not.toHaveBeenCalled();

    expect(fake.pop(null)).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  it("retains the Handler when allow is not called", () => {
    const handler = vi.fn();
    controller.start(handler);

    fake.pop(null);
    fake.pop(null);

    expect(handler).toHaveBeenCalledTimes(2);
    expect(fake.back).not.toHaveBeenCalled();
  });

  it("does not invoke a pending Handler twice", async () => {
    const wait = deferred();
    const handler = vi.fn(() => wait.promise);
    controller.start(handler);

    fake.pop(null);
    fake.pop(null);

    expect(handler).toHaveBeenCalledOnce();
    wait.resolve();
    await wait.promise;
  });

  it("invalidates allow after the Handler completes", () => {
    let allow: (() => void) | undefined;
    controller.start((current) => {
      allow = current;
    });

    fake.pop(null);
    allow?.();

    expect(fake.back).not.toHaveBeenCalled();
  });

  it("allows the real Back after cleaning the buffer", async () => {
    const stop = controller.start((allow) => allow());

    fake.pop(null);
    expect(fake.replace).toHaveBeenCalledOnce();
    expect(fake.back).toHaveBeenCalledOnce();

    const intercept = fake.pop(null);
    await expect(stop()).resolves.toBeUndefined();
    expect(intercept).toHaveBeenCalledOnce();
    expect(fake.back).toHaveBeenCalledTimes(2);
  });

  it("returns one Promise and stops at the page entry", async () => {
    const stop = controller.start(vi.fn());
    const first = stop();

    expect(stop()).toBe(first);
    expect(fake.back).toHaveBeenCalledOnce();

    let completed = false;
    void first.then(() => {
      completed = true;
    });
    await Promise.resolve();
    expect(completed).toBe(false);

    fake.pop(null);
    await expect(first).resolves.toBeUndefined();
    expect(fake.back).toHaveBeenCalledOnce();
  });

  it("makes pending allow ineffective when stopped", async () => {
    const wait = deferred();
    let allow: (() => void) | undefined;
    const stop = controller.start((current) => {
      allow = current;
      return wait.promise;
    });
    fake.pop(null);

    const cleanup = stop();
    allow?.();
    expect(fake.back).toHaveBeenCalledOnce();
    fake.pop(null);
    await cleanup;
    expect(fake.back).toHaveBeenCalledOnce();
    wait.resolve();
  });

  it("reports Handler errors and remains guarded", async () => {
    const failure = new Error("decision failed");
    const handler = vi
      .fn()
      .mockRejectedValueOnce(failure)
      .mockImplementationOnce(() => undefined);
    controller.start(handler);

    fake.pop(null);
    await Promise.resolve();
    await Promise.resolve();
    expect(fake.report).toHaveBeenCalledWith(failure);

    fake.pop(null);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("fails open for an unknown traversal", async () => {
    const handler = vi.fn();
    const stop = controller.start(handler);

    const intercept = fake.pop(null, "https://example.test/other");

    expect(intercept).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
    await expect(stop()).resolves.toBeUndefined();
    expect(fake.remove).toHaveBeenCalledOnce();
  });

  it.each([1, "state", [], new Date()])(
    "fails open for unsupported state %#",
    async (state) => {
      fake.state = state;
      const stop = controller.start(vi.fn());

      await expect(stop()).resolves.toBeUndefined();
      expect(fake.push).not.toHaveBeenCalled();
    },
  );

  it("fails open when the reserved key is occupied", async () => {
    fake.state = { [KEY]: "business", route: "/editor" };
    const stop = controller.start(vi.fn());

    await expect(stop()).resolves.toBeUndefined();
    expect(fake.push).not.toHaveBeenCalled();
    expect(fake.state).toEqual({ [KEY]: "business", route: "/editor" });
  });
});
