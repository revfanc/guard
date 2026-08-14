# 快速开始

## 安装

```bash
pnpm add @revfanc/guard
```

包提供 ESM 与 CommonJS 入口，运行时代码兼容 ES2015，并且没有运行时依赖。

## 创建 guard

在受保护页面挂载后创建 guard：

```ts
import { createBackGuard } from "@revfanc/guard"

const guard = createBackGuard({
  async onBack(attempt) {
    const confirmed = await confirmLeaving()

    if (!confirmed) {
      attempt.resolve()
      return
    }

    attempt.resolve(() => history.back())
  },
  onError(error) {
    console.error("Back guard failed", error)
  },
})
```

建议提供同步的 `onError` 统一记录异常。未配置时，错误可能进入浏览器全局 `error` 或 `unhandledrejection` 通道。

创建时会增加一条同 URL 哨兵记录。用户单步返回后，库恢复保护并调用 `onBack`：

- `attempt.resolve()`：静默解决这次 attempt，留在页面；之后再次返回会产生新的 attempt。
- `attempt.resolve(action)`：完成这一层 guard；最后一层会先回到受保护 base，再执行 action。

`resolve` 不替业务选择去向，因此返回上一条业务记录要明确传入 `() => history.back()`。两个 overload 都返回本次解决是否被接受；同一对象第一次被接受的调用决定结果，后续调用返回 `false`。最后一层静默解决也始终包含一次内部同文档 traversal，只是没有业务 action。

Attempt 与 Guard 共享同一个心智模型：不传 action 就静默解决，传 action 就在安全时机执行一次业务动作。它们结束的对象不同：`attempt.resolve()` 只结束本次返回并重新等待，`guard.resolve()` 则结束整个 guard 生命周期。

## 生命周期清理

```ts
onUnmounted(() => {
  guard.resolve()
})
```

`guard.resolve()` 是无 action 的生命周期结束。静默解决可以移除任意栈层；若最后一层需要清理 sentinel，快速 recreate 会进入队列，不必在组件的 unmount → mount 竞态中自行等待。

主动跳转必须使用 actionful overload，把 router 操作交给 guard 在安全时机执行：

```ts
guard.resolve(() => router.push("/next"))
```

不要写成 `guard.resolve(); router.push(...)`：静默清理可能仍在进行，随后的导航会与内部 History 遍历竞争。Actionful resolve 只允许栈顶 guard；返回 `false` 时 action 不会执行。

框架接入只作为生命周期示例；上面的主动 push 写法用于协调本库自己的 sentinel，不代表库保证 router POP 或 router 与原生 `popstate` 的监听顺序。详见[浏览器限制](./limitations)。
