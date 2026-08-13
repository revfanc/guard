# React Router

在 effect 内创建和销毁 guard：

```tsx
import { useEffect } from "react"
import { createBackGuard } from "@revfanc/guard"

export function Editor() {
  useEffect(() => {
    const guard = createBackGuard({
      onBack({ leave, reset }) {
        openLeaveDialog({ confirm: leave, cancel: reset })
      },
    })

    return () => guard.dispose()
  }, [])

  return <main>Editor</main>
}
```

BrowserRouter 与 HashRouter 均可使用。Guard 会保留 React Router 的 `idx`、`key` 和 `usr` state。通过链接或 `navigate()` 主动离开前，先销毁 guard。
