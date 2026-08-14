# 生命周期

公开模型只有两个动作：

```ts
attempt.allow()
await guard.dispose()
```

它们属于不同领域：`allow()` 是一次 Back 决策，`dispose()` 是 Guard 资源清理，因此不使用同一个模糊动词。

## Attempt

用户 Back 后，库恢复 sentinel，并把 attempt 交给栈顶 Guard：

```ts
const guard = createBackGuard(async (attempt) => {
  if (await confirmLeaving()) {
    attempt.allow()
  }
})
```

handler 完成但未调用 `allow()` 时，这次 Back 被拒绝，attempt 自动失效。下一次 Back 会产生新 attempt。handler Promise pending 时，重复 Back 只恢复 sentinel，不会重复展示业务决策。

如果 attempt 上方创建了新 Guard，它会暂停；暂停时 `allow()` 返回 `false`。上层 Guard 被移除后，只要原 handler 仍 pending，原 attempt 就能恢复。若 handler 已经完成，attempt 已失效，下一次 Back 会重新调用 handler。

## Guard

`dispose()` 可以移除任意栈层：

```ts
await guard.dispose()
```

非最后一层立即完成。最后一层需要先把当前 sentinel 清理为普通记录，再通过一次同文档遍历回到受保护 base；Promise 在观察到该 `popstate` 后完成。

主动导航应串行执行：

```ts
await guard.dispose()
await router.push("/next")
```

## 三个内部阶段

```text
idle
  └─ createBackGuard() → armed

armed
  ├─ final dispose() → traversing/restart → armed / idle
  └─ final allow()   → traversing/back    → idle → native Back
```

- `idle`：没有活动 sentinel 或 Guard。
- `armed`：sentinel 位于当前记录，LIFO Guard 栈正常工作。
- `traversing/restart`：最后一层正在清理；新 Guard 可以排队，但要等 base `popstate` 后才激活。
- `traversing/back`：最终 Back 已经获准，决定不可撤回；清理完成后自动再执行一次原生 Back，新 Guard 创建会同步抛错。

History API 没有遍历完成 Promise。runtime 只能通过目标 `popstate` 完成 `dispose()` 或继续 Back，不使用 timeout 或 `history.length` 猜测结果。如果浏览器不发送预期事件，Promise 会保持 pending。

## 错误

handler 未处理异常时，库先结束当前 attempt、保持页面受保护，再交给浏览器全局错误通道。`dispose()` 直接触发的错误通过 Promise rejection 返回。内部事件故障会使受影响的一代 Guard fail-closed，并走全局错误通道。
