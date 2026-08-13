# 多层 Guard

多个 guard 按后创建优先（LIFO）工作，但不会自动向下传递，也不会替其他层作决定。

```ts
let pageAttempt: BackAttempt | undefined

const pageGuard = createBackGuard({
  onBack(attempt) {
    pageAttempt = attempt
    showPageExitDialog()
  },
})

const modalGuard = createBackGuard({
  onBack({ stay, done }) {
    showModalDialog({
      cancel: stay,
      confirm: () => done(closeModal),
    })
  },
})
```

若 `pageGuard` 已经在提示时创建并触发 `modalGuard`，页面的 attempt 会暂停。此时页面弹窗调用 `done` 返回 `false`，动作不执行。

`modalGuard.dispose()` 后，原页面 attempt 恢复有效，业务可以继续使用之前保存的 `pageAttempt`；`pageGuard.onBack` 不会重复执行。

每层 `done(action)` 只完成该层并执行该层 action。只有最后一层完成时，库才先清理哨兵再执行它的 action。
