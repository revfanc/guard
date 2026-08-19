# 快速开始

## 安装

```bash
pnpm add @revfanc/guard
```

本包没有运行时依赖，也不需要安装插件。

## 注册 Guard

```ts
import { createGuard } from "@revfanc/guard"

const stop = createGuard(async (allow) => {
  const confirmed = await openConfirmDialog()
  if (confirmed) allow()
})
```

注册会建立或接管一条同 URL History 缓冲。Handler 应返回覆盖完整决策周期的 Promise；pending 期间后续顺序 Back 不会重复调用 Handler。

一个 Window 同时只有一个 Handler。应用需要页面、Dialog 等多级回调时，应由业务维护当前回调或栈，再从唯一 Handler 中分发。

## 停止

```ts
await stop()
```

停止函数幂等。主动导航前必须等待它完成：

```ts
await stop()
location.assign("/next")
```

React、Vue 等框架只负责在自身生命周期内停止和重新创建 Guard。参见 [React](/frameworks/react) 和 [Vue](/frameworks/vue)。
