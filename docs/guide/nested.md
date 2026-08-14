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
  onBack(attempt) {
    showModalDialog({
      cancel: () => attempt.resolve(),
      confirm: () => attempt.resolve(closeModal),
    })
  },
})
```

## Attempt 暂停与恢复

若 `pageGuard` 已经收到 attempt，随后又创建 `modalGuard`，页面 attempt 会暂停。暂停期间调用 `pageAttempt.resolve(...)` 返回 `false`，不改变状态，也不执行 action。

`modalGuard.resolve()` 后，原页面 attempt 恢复有效，业务可以继续使用之前保存的 `pageAttempt`；`pageGuard.onBack` 不会重复执行。

## 静默解决可以跨层

不带 action 的 `guard.resolve()` 只是生命周期结束，因此可以移除任意一层：

```ts
pageGuard.resolve()
```

即使 `pageGuard` 上方仍有 modal，这个调用也可以成功。它不会替 modal 作决定，也不会执行导航。之后 modal 仍然是栈顶。

## 带 action 只能解决栈顶

带 action 的 Guard 解决会执行该层业务动作，必须遵守 LIFO：

```ts
modalGuard.resolve(closeModal) // modal 是栈顶时可以被接受
pageGuard.resolve(goToNext)    // modal 仍在上方时返回 false
```

只有返回 `true` 的 actionful resolve 才会执行 action。因非栈顶或尚未激活而返回 `false` 时不会消耗 guard，可以在它成为栈顶并激活后重试；如果原因是 sentinel 丢失或 History 回滚失败，runtime 会 fail-closed，该句柄不会恢复。

Attempt 本身也只在所属 guard 位于栈顶且 attempt 仍有效时才能解决。每层 `attempt.resolve(action)` 只完成该层并执行该层 action，不会自动触发下层 `onBack`。只有最后一层完成时，库才先从 sentinel 回到受保护 base，再执行它的 action。
