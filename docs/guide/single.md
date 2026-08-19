# 单一 Guard

一个 Window 同时只有一个 Guard。以下代码中，第二个 Handler 替换第一个 Handler：

```ts
const stopPage = createGuard(pageHandler)
const stopDialog = createGuard(dialogHandler)
```

此时：

- History 只增加一条缓冲；
- Back 只调用 `dialogHandler`；
- `stopPage()`立即完成，不影响 `dialogHandler`；
- `stopDialog()`才会清理当前缓冲。

如果应用需要页面、Dialog、抽屉等多层决策，应在业务层维护优先级：

```ts
const stop = createGuard(async (allow) => {
  const dialog = dialogs[dialogs.length - 1]
  if (dialog) {
    dialog.close()
    return
  }

  if (await handlePageBack() === "unmatched") {
    allow()
  }
})
```

Guard 只负责 History 缓冲；业务负责决定当前回调。
