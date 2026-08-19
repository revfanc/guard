# React

在 effect 中注册，并在清理函数中触发异步停止：

```tsx
import { useEffect } from "react"
import { createGuard } from "@revfanc/guard"

function Editor() {
  useEffect(() => {
    const stop = createGuard(async (allow) => {
      if (await confirmLeaving()) allow()
    })

    return () => {
      void stop()
    }
  }, [])

  return <main>Editor</main>
}
```

一个 Window 同时只有一个 Handler。多个组件不能各自依赖 Guard 栈，应由 Context、store 或应用级 hook 选择当前业务回调。

React 不会等待 effect cleanup 返回 Promise。按钮或业务代码主动导航时，应显式等待：

```ts
await stop()
navigate("/next")
```
