# Vue Router

## Router 配置

```ts
// router.ts
import { createRouter, createWebHistory } from "vue-router"

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/editor", component: () => import("./Editor.vue") },
    { path: "/home", component: () => import("./Home.vue") },
  ],
})
```

## 应用安装

```ts
import { createApp } from "vue"
import { createGuard } from "@revfanc/guard"
import { router } from "./router"
import App from "./App.vue"

const app = createApp(App)

app.use(router)
app.use(createGuard(router))
app.mount("#app")
```

## 组件使用

```vue
<script setup lang="ts">
import { useGuard } from "@revfanc/guard"
import { ref } from "vue"

const dirty = ref(true)

useGuard(async (allow) => {
  if (!dirty.value || await confirmLeaving()) {
    allow()
  }
})
</script>
```

只有 POP 会触发 Handler。代码中的 `router.push()` 和 `router.replace()` 会正常通过；如果它们也需要确认，请使用 Vue Router 自身的导航守卫实现业务规则。

Browser、Hash 和 Memory history 使用相同的 Guard API。
