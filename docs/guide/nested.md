# 嵌套 Guard

Guard 使用 LIFO 顺序，适合页面、流程和覆盖层各自声明返回决策。

```ts
const pageGuard = createBackGuard({
  onBack({ leave }) {
    showPageExitDialog(leave)
  },
})

const modalGuard = createBackGuard({
  onBack({ leave, reset }) {
    closeModal()
    leave() // 将同一次返回意图交给 pageGuard
    // 如果只想关闭弹窗并结束本次意图，应在业务中重新组织 guard 生命周期。
  },
})
```

第一次返回只通知栈顶 `modalGuard`。它调用 `leave()` 后，`pageGuard` 会收到 `source: "cascade"`。只有所有层都调用 `leave()`，浏览器才真正返回。

在顶层 guard 存在时创建新 guard，会使旧顶层尚未完成的 attempt 失效并重新布防。这样旧异步弹窗无法越过新压入的业务层。
