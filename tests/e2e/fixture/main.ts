import {
  computed,
  createApp,
  defineComponent,
  h,
  reactive,
} from "vue";
import {
  createRouter,
  createWebHistory,
  RouterView,
} from "vue-router";
import { createGuard, useGuard, type Handler } from "@guard";

type Decision = {
  allow: () => void;
  resolve: () => void;
};

const state = reactive({
  a: 0,
  b: 0,
  decision: "idle",
});
const decisions = new Map<"a" | "b", Decision>();
const stops = new Map<"a" | "b", () => void>();

function handler(name: "a" | "b"): Handler {
  return (allow) => {
    state[name] += 1;
    state.decision = `${name}:pending`;
    return new Promise<void>((resolve) => {
      decisions.set(name, { allow, resolve });
    });
  };
}

function settle(name: "a" | "b", allowed: boolean): void {
  const decision = decisions.get(name);
  if (!decision) return;
  decisions.delete(name);
  if (allowed) decision.allow();
  decision.resolve();
  state.decision = `${name}:${allowed ? "allowed" : "denied"}`;
}

const routes = ["/", "/a", "/b", "/c", "/d"].map((path) => ({
  path,
  component: defineComponent({
    setup: () => () => h("p", { "data-testid": "content" }, path.slice(1).toUpperCase()),
  }),
}));
const router = createRouter({ history: createWebHistory(), routes });

const App = defineComponent({
  setup() {
    const path = computed(() => router.currentRoute.value.fullPath);
    const button = (testId: string, text: string, action: () => void) =>
      h("button", { "data-testid": testId, onClick: action }, text);

    return () =>
      h("main", [
        h("h1", { "data-testid": "path" }, path.value),
        h(RouterView),
        button("back", "Back", () => router.back()),
        button("forward", "Forward", () => router.forward()),
        button("minus-two", "go(-2)", () => router.go(-2)),
        button("plus-two", "go(2)", () => router.go(2)),
        button("push", "push D", () => void router.push("/d")),
        button("replace", "replace A", () => void router.replace("/a")),
        button("add-a", "Add A", () => add("a")),
        button("add-b", "Add B", () => add("b")),
        button("allow-a", "Allow A", () => settle("a", true)),
        button("deny-a", "Deny A", () => settle("a", false)),
        button("allow-b", "Allow B", () => settle("b", true)),
        button("deny-b", "Deny B", () => settle("b", false)),
        button("stop-a", "Stop A", () => stop("a")),
        button("stop-b", "Stop B", () => stop("b")),
        h("output", { "data-testid": "a-attempts" }, String(state.a)),
        h("output", { "data-testid": "b-attempts" }, String(state.b)),
        h("output", { "data-testid": "decision" }, state.decision),
      ]);
  },
});

const app = createApp(App);
const plugin = createGuard(router);
app.use(router);
app.use(plugin);

function add(name: "a" | "b"): void {
  stops.get(name)?.();
  const current = app.runWithContext(() => useGuard(handler(name)));
  stops.set(name, current);
  state.decision = `${name}:added`;
}

function stop(name: "a" | "b"): void {
  stops.get(name)?.();
  stops.delete(name);
  state.decision = `${name}:stopped`;
}

await router.replace("/a");
await router.push("/b");
await router.push("/c");
app.mount("#app");
add("a");
