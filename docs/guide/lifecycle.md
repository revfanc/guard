# 生命周期

公开模型只有两个动作：

```ts
allow()
await guard.dispose()
```

`allow()` 是一次 Back 决策，`dispose()` 是 Guard 资源清理。

## 决策

用户 Back 后，库先恢复 sentinel，再把 `allow` 交给最上层 Guard：

```ts
const guard = createBackGuard(async (allow) => {
  if (await confirmLeaving()) {
    allow()
  }
})
```

handler 完成但未调用 `allow()` 时，这次 Back 被拒绝，`allow` 自动失效。下一次 Back 会产生新决策。handler Promise pending 时，逐次重复 Back 只恢复 sentinel，不会重复展示业务决策。

如果当前 Guard 上方创建了新 Guard，它的 `allow` 会暂停；暂停时调用返回 `false`。上层 Guard 被移除后，只要原 handler 仍 pending，原 `allow` 就能恢复。若 handler 已经完成，`allow` 已失效，下一次 Back 会重新调用 handler。

## Guard

`dispose()` 可以移除任意层：

```ts
await guard.dispose()
```

非最后一层立即完成。最后一层需要先把当前 sentinel 清理为普通记录，再通过一次同文档遍历回到带有同一 generation 的 base；Promise 在校验并清理该 base 后完成。最新 sentinel 业务 state 会写回当前 base。

主动导航应串行执行：

```ts
await guard.dispose()
await router.push("/next")
```

## 三个阶段

```text
idle -> active -> cleaning -> idle
                         -> active
```

- `idle`：没有 sentinel 或 Guard。
- `active`：sentinel 生效，`guards` 按 LIFO 工作。
- `cleaning`：`closing` 正在清除 sentinel 并等待 base `popstate`。
- `stay`：最后一个 Guard 正在 dispose；清理期间创建的新 Guard 进入 `guards`，随后重新 `active`。
- `leave`：最后一个 Guard 已调用 `allow()`；清理完成后继续原生 Back，此时不能再创建 Guard。

`active` 和 `cleaning` 统一使用 `guards`。前者表示当前活动的 Guard，后者表示清理完成后需要激活的 Guard；被清理的最后一层单独保存在 `closing`。

History API 没有遍历完成 Promise。Runtime 只能通过目标 `popstate` 完成 `dispose()` 或继续 Back，不使用 timeout 或 `history.length` 猜测结果。如果浏览器不发送任何事件，Promise 仍会保持 pending；如果收到了非目标 traversal，Guard 正常结束且不改写目标记录。

## 错误

handler 未处理异常时，库先结束当前决策、保持页面受保护，再交给浏览器全局错误通道。History 操作失败会使相关 Guard 的 `dispose()` reject；事件回调中的内部失败还会进入全局错误通道。外部替换 sentinel 或 Back 越过精确 base 时，Guard 正常结束，库不会主动抛错，也不会在错误位置补写历史。
