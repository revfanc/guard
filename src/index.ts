import {
  getCurrentScope,
  inject,
  onScopeDispose,
  type InjectionKey,
} from "vue";
import { adapt, valid } from "./router";
import { Runtime } from "./runtime";
import type { Guard, Handler } from "./types";

const KEY = Symbol.for("@revfanc/guard") as InjectionKey<Runtime>;
const REGISTRY = Symbol.for("@revfanc/guard.registry");
const INVALID = "@revfanc/guard: router must be a Vue Router instance.";
const HANDLER = "@revfanc/guard: handler must be a function.";
const MISSING = "@revfanc/guard: the Guard plugin is not installed.";

type Root = typeof globalThis & { [key: symbol]: unknown };

type Router = import(
  "vue-router",
  { with: { "resolution-mode": "import" } }
).Router;

function registry(): WeakMap<Router, Runtime> {
  const root = globalThis as Root;
  const existing = root[REGISTRY];
  if (existing instanceof WeakMap) {
    return existing as WeakMap<Router, Runtime>;
  }
  if (existing !== undefined) {
    throw new Error("@revfanc/guard: the registry slot is already occupied.");
  }

  const value = new WeakMap<Router, Runtime>();
  Object.defineProperty(root, REGISTRY, {
    configurable: false,
    enumerable: false,
    value,
    writable: false,
  });
  return value;
}

export type { Guard, Handler } from "./types";

export function createGuard(router: Router): Guard {
  if (!valid(router)) throw new TypeError(INVALID);

  const runtimes = registry();
  let runtime = runtimes.get(router);
  if (!runtime) {
    runtime = new Runtime(adapt(router));
    runtimes.set(router, runtime);
  }

  return {
    install(app): void {
      app.provide(KEY, runtime);
    },
  };
}

export function useGuard(handler: Handler): () => void {
  if (typeof handler !== "function") throw new TypeError(HANDLER);
  const runtime = inject(KEY, undefined);
  if (!runtime) throw new Error(MISSING);

  const stop = runtime.add(handler);
  if (getCurrentScope()) onScopeDispose(stop);
  return stop;
}
