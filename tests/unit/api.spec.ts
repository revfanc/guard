import { createApp, defineComponent, h } from "vue";
import {
  createMemoryHistory,
  createRouter,
  type Router,
} from "vue-router";
import { describe, expect, it, vi } from "vitest";
import { createGuard, useGuard } from "../../src/index";

function router(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/", component: { render: () => null } }],
  });
}

describe("public API", () => {
  it("validates the router at creation", () => {
    expect(() => createGuard(undefined as never)).toThrow(
      "router must be a Vue Router instance",
    );
    expect(() => createGuard({ beforeEach: vi.fn() } as never)).toThrow(
      "router must be a Vue Router instance",
    );
  });

  it("validates the handler", () => {
    const app = createApp({ render: () => null });
    app.use(createGuard(router()));

    expect(() =>
      app.runWithContext(() => useGuard(null as never)),
    ).toThrow("handler must be a function");
  });

  it("requires the plugin in the current injection context", () => {
    const error = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const app = createApp({ render: () => null });

    expect(() => app.runWithContext(() => useGuard(vi.fn()))).toThrow(
      "Guard plugin is not installed",
    );
    error.mockRestore();
  });

  it("returns an idempotent stop function", () => {
    const app = createApp({ render: () => null });
    app.use(createGuard(router()));
    const stop = app.runWithContext(() => useGuard(vi.fn()));

    expect(stop).toBeTypeOf("function");
    expect(() => {
      stop();
      stop();
    }).not.toThrow();
  });

  it("stops automatically with the component scope", () => {
    const current = router();
    const stop = vi.fn();
    const plugin = createGuard(current);
    const original = current.options.history.listen.bind(
      current.options.history,
    );
    vi.spyOn(current.options.history, "listen").mockImplementation((listener) => {
      const cleanup = original(listener);
      return () => {
        stop();
        cleanup();
      };
    });
    const component = defineComponent({
      setup() {
        useGuard(vi.fn());
        return () => h("div");
      },
    });
    const app = createApp(component);
    app.use(plugin);
    const root = document.createElement("div");

    app.mount(root);
    app.unmount();
    expect(stop).toHaveBeenCalledOnce();
  });
});
