# 快速开始

## 安装

```bash
pnpm add @revfanc/guard
```

## 创建 guard

```ts
import { createBackGuard } from "@revfanc/guard"

const guard = createBackGuard({
  onBack({ source, leave, reset }) {
    showConfirmDialog({
      message: source === "cascade" ? "上一层已经放行，是否继续返回？" : "确定返回？",
      onConfirm: leave,
      onCancel: reset,
    })
  },
  onError(error) {
    console.error("Back guard failed", error)
  },
})
```

进入页面时会新增一条同 URL 历史记录。用户触发一次返回后，库立即补回保护记录，再调用 `onBack`。确认离开时调用 `leave()`；取消时调用 `reset()`。

## 异步对话框

```ts
const guard = createBackGuard({
  async onBack({ leave, reset }) {
    const confirmed = await confirmLeaving()

    if (confirmed) {
      leave()
      return
    }

    reset()
  },
})
```

`leave()` 和 `reset()` 都绑定当前 attempt。旧弹窗晚到的操作会返回 `false`，不会误操作后来的 guard。

## 销毁

在组件卸载或主动向前导航之前销毁：

```ts
guard.dispose()
```

最后一个 guard 被销毁时，库会静默移除哨兵并停留在当前页面。
