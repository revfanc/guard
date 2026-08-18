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

React 不会等待 effect cleanup 返回 Promise。需要在按钮或业务代码中主动导航时，应显式等待：

```ts
await stop()
navigate("/next")
```
