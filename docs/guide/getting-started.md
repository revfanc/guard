# 快速开始

## 安装

```bash
pnpm add @revfanc/guard
```

需要 Vue `^3.5.0`，以及 Vue Router `^4.5.0 || ^5.0.0`。

## 安装插件

```ts
import { createApp } from "vue"
import { createGuard } from "@revfanc/guard"
import { router } from "./router"
import App from "./App.vue"

const app = createApp(App)
const guard = createGuard(router)

app.use(router)
app.use(guard)
app.mount("#app")
```

必须把业务使用的同一个 Router 实例传给 `createGuard()`。

## 注册 Guard

```ts
import { useGuard } from "@revfanc/guard"

const stop = useGuard(async (allow) => {
  const confirmed = await openConfirmDialog()
  if (confirmed) allow()
})
```

Handler 必须返回覆盖完整决策周期的 Promise。决策结束前再次触发 POP 不会重复调用 Handler。

不再需要保护时可主动停止：

```ts
stop()
```

在组件 `setup()` 或 effect scope 中调用时，作用域销毁也会自动停止。
