# 快速开始

## 安装

```bash
pnpm add @revfanc/guard
```

包同时提供 ESM 与 CommonJS 入口，运行时代码兼容 ES2015，没有运行时依赖。

## 创建 Guard

```ts
import { createBackGuard } from "@revfanc/guard"

const guard = createBackGuard(async (allow) => {
  if (await confirmLeaving()) {
    allow()
  }
})
```

首次创建时会增加一条同 URL sentinel；刷新后重新创建 Guard 会直接接管当前 sentinel。用户单步返回后，库恢复保护并调用 handler：

- 调用 `allow()`：同意这次返回；最后一层会自动继续原始 Back。
- handler 完成但没有调用 `allow()`：留在页面并重新等待下一次返回。
- handler Promise pending：逐次重复 Back 不会产生第二次决策。

异步弹窗必须返回 Promise：

```ts
const guard = createBackGuard((allow) => {
  return openDialog().then((confirmed) => {
    if (confirmed) allow()
  })
})
```

## 生命周期清理

组件卸载时结束 Guard：

```ts
void guard.dispose().catch(reportError)
```

需要主动跳转时应等待清理完成：

```ts
await guard.dispose()
await router.push("/next")
```

`dispose()` 不会替业务导航；它只清除本库自己的保护。快速 unmount → mount 时，可以在旧 Promise 完成前创建下一代 Guard，runtime 会将它排队并在 base `popstate` 后激活。

这个包只处理原生单步 Back。Vue Router、React Router 等路由器的 POP 和监听顺序不属于保证范围；需要覆盖应用内路由跳转时，使用 router 自身的 navigation guard 或 blocker。
