# React 生命周期示例

这是组件生命周期示例，不是 React Router POP 兼容承诺。需要覆盖应用内路由跳转时，请使用 React Router 自身的 blocker。

```tsx
import { useEffect, useRef } from "react"
import { createBackGuard } from "@revfanc/guard"

export function Editor() {
  const guardRef = useRef<ReturnType<typeof createBackGuard>>()

  useEffect(() => {
    const guard = createBackGuard(async (allow) => {
      if (await confirmLeaving()) {
        allow()
      }
    })
    guardRef.current = guard

    return () => {
      if (guardRef.current === guard) guardRef.current = undefined
      void guard.dispose().catch(reportError)
    }
  }, [])

  return <main>Editor</main>
}
```

主动 navigation 应等待本库清理：

```tsx
async function goNext() {
  const guard = guardRef.current
  guardRef.current = undefined

  await guard?.dispose()
  navigate("/next")
}
```

这只协调本库 sentinel 与主动 navigation。库不保证 React Router POP、blocker 顺序或 router 与原生 `popstate` 监听器的先后。创建 Guard 前还需确认当前 `history.state` 满足[严格输入契约](../guide/limitations#historystate-契约)。
