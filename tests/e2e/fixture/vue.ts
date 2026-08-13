import { createApp, h } from "vue";
import { createRouter, createWebHashHistory, createWebHistory } from "vue-router";
import VueApp from "./VueApp.vue";

export async function mountVueFixture(mode: "browser" | "hash"): Promise<void> {
  const history = mode === "hash"
    ? createWebHashHistory()
    : createWebHistory();
  const router = createRouter({
    history,
    routes: [
      { path: "/", component: { render: () => h("p", "Home route") } },
      { path: "/protected", component: { render: () => h("p", "Protected route") } },
    ],
  });
  createApp(VueApp).use(router).mount("#app");
  await router.isReady();
}
