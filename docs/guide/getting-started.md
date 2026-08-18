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

首次注册会建立一条同 URL History 缓冲。后续注册共享该缓冲，并按 LIFO 顺序处理。

Handler 应返回覆盖完整决策周期的 Promise。决策 pending 期间再次顺序触发 Back，不会重复调用 Handler。

## 停止

```ts
await stop()
```

停止函数幂等。主动导航前必须先等待它完成：

```ts
await stop()
location.assign("/next")
```

## 生命周期框架

React、Vue 等框架只负责在自身生命周期中调用停止函数，Guard 核心不依赖任何框架。参见 [React](/frameworks/react) 和 [Vue](/frameworks/vue)。
