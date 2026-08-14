# React 生命周期示例

这是静态生命周期示例，不是 React Router POP 兼容承诺。库不保证 router 与原生 `popstate` 的监听顺序；需要覆盖应用内路由跳转时，应使用 React Router 自身的 blocker。

```tsx
import { useEffect, useRef } from "react"
import { createBackGuard } from "@revfanc/guard"

export function Editor() {
  const guardRef = useRef<ReturnType<typeof createBackGuard>>()

  useEffect(() => {
    const guard = createBackGuard({
      async onBack(attempt) {
        if (await confirmLeaving()) {
          attempt.resolve(() => history.back())
          return
        }

        attempt.resolve()
      },
    })
    guardRef.current = guard

    return () => {
      if (guardRef.current === guard) {
        guardRef.current = undefined
      }
      guard.resolve()
    }
  }, [])

  return <main>Editor</main>
}
```

Effect cleanup 使用无 action 的 `resolve()`。最后一层的静默 cleanup 尚未完成时，Strict Mode 的快速重挂载或新的 `createBackGuard()` 会排队。

主动 router 导航则把 navigation 放进 actionful overload，不能先静默 resolve 再单独 navigate：

```tsx
function goNext() {
  const guard = guardRef.current

  if (!guard) {
    navigate("/next")
    return
  }

  guard.resolve(() => {
    if (guardRef.current === guard) {
      guardRef.current = undefined
    }
    navigate("/next")
  })
}
```

Actionful resolve 只允许栈顶 guard。返回 `false` 时 navigation action 不会执行。

这个模式只协调本库 sentinel 与主动 navigation。它不保证 React Router POP、blocker 顺序或 router 与原生 `popstate` 监听器的先后。创建 guard 前请确认当前 `history.state` 满足[严格输入契约](../guide/limitations#history-state-契约)。
