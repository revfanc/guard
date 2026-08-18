import { createApp } from "vue";
import type { Router } from "vue-router";
import * as router5 from "vue-router";
import * as router4 from "vue-router4";
import { describe, expect, it, vi } from "vitest";
import { createGuard, useGuard } from "../../src/index";
import type { Handler } from "../../src/types";

type Api = Pick<
  typeof router5,
  | "createMemoryHistory"
  | "createRouter"
  | "createWebHashHistory"
  | "createWebHistory"
>;

type Current = ReturnType<Api["createRouter"]>;
type History = ReturnType<Api["createMemoryHistory"]>;

function go(
  router: Current,
  history: History,
  delta: number,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const removeAfter = router.afterEach((_to, _from, failure) => {
      removeAfter();
      removeError();
      resolve(failure);
    });
    const removeError = router.onError((error) => {
      removeAfter();
      removeError();
      reject(error);
    });
    history.go(delta);
  });
}

function suite(version: string, api: Api): void {
  describe(`Vue Router ${version}`, () => {
    async function setup(): Promise<{
      add(handler: Handler): () => void;
      history: History;
      router: Current;
    }> {
      const history = api.createMemoryHistory();
      const router = api.createRouter({
        history,
        routes: ["/a", "/b", "/c", "/d"].map((path) => ({
          path,
          component: { render: () => null },
        })),
      });
      await router.push("/a");
      await router.push("/b");
      await router.push("/c");

      const app = createApp({ render: () => null });
      app.use(createGuard(router as unknown as Router));
      return {
        add: (handler) => app.runWithContext(() => useGuard(handler)),
        history,
        router,
      };
    }

    it("allows and rejects Back", async () => {
      const { add, history, router } = await setup();
      let allowed = false;
      const handler = vi.fn((allow: () => void) => {
        if (allowed) allow();
      });
      add(handler);

      await go(router, history, -1);
      expect(router.currentRoute.value.fullPath).toBe("/c");
      expect(handler).toHaveBeenCalledOnce();

      allowed = true;
      await go(router, history, -1);
      expect(router.currentRoute.value.fullPath).toBe("/b");
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it("preserves and guards Forward", async () => {
      const { add, history, router } = await setup();
      add((allow) => allow());
      await go(router, history, -1);
      expect(router.currentRoute.value.fullPath).toBe("/b");

      let allowed = false;
      const handler = vi.fn((allow: () => void) => {
        if (allowed) allow();
      });
      add(handler);
      await go(router, history, 1);
      expect(router.currentRoute.value.fullPath).toBe("/b");

      allowed = true;
      await go(router, history, 1);
      expect(router.currentRoute.value.fullPath).toBe("/c");
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it("handles multi-entry negative and positive go", async () => {
      const { add, history, router } = await setup();
      add((allow) => allow());
      await go(router, history, -2);
      expect(router.currentRoute.value.fullPath).toBe("/a");

      add((allow) => allow());
      await go(router, history, 2);
      expect(router.currentRoute.value.fullPath).toBe("/c");
    });

    it("consumes nested guards in LIFO order", async () => {
      const { add, history, router } = await setup();
      const calls: string[] = [];
      add((allow) => {
        calls.push("outer");
        allow();
      });
      add((allow) => {
        calls.push("inner");
        allow();
      });

      await go(router, history, -1);
      expect(router.currentRoute.value.fullPath).toBe("/c");
      await go(router, history, -1);
      expect(router.currentRoute.value.fullPath).toBe("/b");
      expect(calls).toEqual(["inner", "outer"]);
    });

    it("does not guard push or replace", async () => {
      const { add, router } = await setup();
      const handler = vi.fn();
      const stop = add(handler);

      await router.push("/d");
      await router.replace("/a");
      expect(handler).not.toHaveBeenCalled();
      stop();
    });

    it("passes handler errors to router.onError", async () => {
      const { add, history, router } = await setup();
      const error = new Error("decision failed");
      add(() => Promise.reject(error));

      await expect(go(router, history, -1)).rejects.toBe(error);
      expect(router.currentRoute.value.fullPath).toBe("/c");
    });

    it("invalidates an asynchronous allow when the active layer stops", async () => {
      const { add, history, router } = await setup();
      let allow: (() => void) | undefined;
      let resolve!: () => void;
      const promise = new Promise<void>((current) => {
        resolve = current;
      });
      const stop = add((current) => {
        allow = current;
        return promise;
      });

      const navigation = go(router, history, -1);
      await vi.waitFor(() => expect(allow).toBeTypeOf("function"));
      stop();
      allow?.();
      resolve();

      await navigation;
      expect(router.currentRoute.value.fullPath).toBe("/c");
    });
  });
}

suite("4.5", router4 as unknown as Api);
suite("5", router5);

function historySuite(version: string, api: Api): void {
  describe.sequential(`Vue Router ${version} web histories`, () => {
    for (const [mode, create] of [
      ["Browser", api.createWebHistory],
      ["Hash", api.createWebHashHistory],
    ] as const) {
      it(`handles Back, Forward and go(N) with ${mode} history`, async () => {
        const history = create();
        const router = api.createRouter({
          history,
          routes: ["/a", "/b", "/c"].map((path) => ({
            path,
            component: { render: () => null },
          })),
        });
        await router.push("/a");
        await router.push("/b");
        await router.push("/c");
        const app = createApp({ render: () => null });
        app.use(createGuard(router as unknown as Router));
        const add = (handler: Handler) =>
          app.runWithContext(() => useGuard(handler));

        let accepted = false;
        let calls = 0;
        add((allow) => {
          calls += 1;
          if (accepted) allow();
        });
        await go(router, history, -1);
        await vi.waitFor(() => expect(history.location).toBe("/c"));

        accepted = true;
        await go(router, history, -1);
        expect(router.currentRoute.value.fullPath).toBe("/b");
        expect(calls).toBe(2);

        add((allow) => allow());
        await go(router, history, 1);
        expect(router.currentRoute.value.fullPath).toBe("/c");

        const order: string[] = [];
        add((allow) => {
          order.push("outer");
          allow();
        });
        add((allow) => {
          order.push("inner");
          allow();
        });
        await go(router, history, -2);
        await vi.waitFor(() => expect(history.location).toBe("/c"));
        await go(router, history, -2);
        expect(router.currentRoute.value.fullPath).toBe("/a");
        expect(order).toEqual(["inner", "outer"]);

        add((allow) => allow());
        await go(router, history, 2);
        expect(router.currentRoute.value.fullPath).toBe("/c");
        history.destroy();
      });
    }
  });
}

historySuite("4.5", router4 as unknown as Api);
historySuite("5", router5);
