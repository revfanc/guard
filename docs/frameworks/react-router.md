# React 生命周期示例

这是静态生命周期示例，不是 React Router POP 兼容承诺。库不保证 router 与原生 `popstate` 的监听顺序；需要覆盖应用内路由跳转时，应使用 React Router 自身的 blocker。

```tsx
import { useEffect, useRef } from "react"
import { createBackGuard } from "@revfanc/guard"

export function Editor() {
  const guardRef = useRef<ReturnType<typeof createBackGuard>>()

  useEffect(() => {
    const guard = createBackGuard({
      async onBack({ stay, done }) {
        if (await confirmLeaving()) {
          done(() => history.back())
          return
        }

        stay()
      },
    })
    guardRef.current = guard

    return () => {
      if (guardRef.current === guard) {
        guardRef.current = undefined
      }
      guard.dispose()
    }
  }, [])

  return <main>Editor</main>
}
```

主动 router 导航前同步注销 guard：

```tsx
function goNext() {
  guardRef.current?.dispose()
  guardRef.current = undefined
  navigate("/next")
}
```

创建 guard 前请确认当前 `history.state` 满足[严格输入契约](../guide/limitations#history-state-契约)。
