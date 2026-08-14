# 多层 Guard

多个 Guard 按后创建优先（LIFO）工作。一次 Back 只交给当前栈顶，不会替其他层作决定。

```ts
let pageAttempt: BackAttempt | undefined

const pageGuard = createBackGuard((attempt) => {
  pageAttempt = attempt
  return showPageExitDialog().then((confirmed) => {
    if (confirmed) attempt.allow()
  })
})

const modalGuard = createBackGuard((attempt) => {
  return showModalDialog().then((close) => {
    if (close) {
      closeModal()
      attempt.allow()
    }
  })
})
```

## Attempt 暂停

如果 `pageGuard` 已有 pending attempt，随后创建 `modalGuard`，页面 attempt 会暂停。暂停期间 `pageAttempt.allow()` 返回 `false`。

上层 Guard 被 dispose 后，只要页面 handler 的 Promise 仍 pending，原 attempt 就能恢复；如果 Promise 已完成，原 attempt 已失效，下一次 Back 会重新调用页面 handler。

## `allow()` 只完成栈顶层

非最后一层调用 `allow()` 时，只移除该逻辑层并消费本次 Back，不会继续物理 Back，也不会触发下层 handler。弹窗关闭等局部业务动作应在 `allow()` 前执行。

只有最后一层 `allow()` 才会清理 sentinel 并自动继续原始 Back。

## `dispose()` 可以跨层

`dispose()` 是生命周期操作，可以移除任意层：

```ts
await pageGuard.dispose()
```

即使它上方仍有 modal，这个调用也不会替 modal 作决定或触发导航。最后剩下的一层被 dispose 时才需要等待 sentinel cleanup。
