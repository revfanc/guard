# API

## `createBackGuard(onBack)`

```ts
function createBackGuard(onBack: BackHandler): BackGuard

type BackHandler = (
  attempt: BackAttempt,
) => void | PromiseLike<void>
```

在当前页面创建一层 Back Guard。首次创建会增加一条同 URL 哨兵记录；刷新后的新运行时如果发现兼容的当前 sentinel，会直接接管而不重复增加记录。如果上一代正在执行 `dispose()` 清理，新 Guard 会排队，直到内部遍历回到 base 后再激活。

非浏览器环境、History API 不完整、handler 不是函数或当前 `history.state` 不符合契约时同步抛错。

### Handler 生命周期

用户单步返回后，库先恢复 sentinel，再调用 handler：

- handler pending 期间，重复 Back 不会重复调用 handler。
- handler 完成但没有调用 `allow()`，表示拒绝本次返回；attempt 失效，Guard 重新等待。
- 异步弹窗必须返回覆盖完整决策周期的 Promise。仅启动回调式弹窗后立即返回，会使 attempt 立即失效。
- handler 的未处理 throw 或 rejection 会先使 attempt 失效并重新布防，再进入浏览器全局错误通道。

## `BackAttempt`

```ts
interface BackAttempt {
  allow(): boolean
}
```

`allow()` 无参数，表示同意当前这次 Back：

- 只有仍有效且所属 Guard 位于栈顶时返回 `true`。
- 暂停、过期或已经完成的 attempt 返回 `false`。
- 如果它属于最后一层 Guard，库先清理 sentinel，再自动继续原始 Back。
- 如果上方是逻辑嵌套 Guard，`allow()` 只完成该层并消费这次 Back，不会自动触发下层 handler。业务可以在调用前关闭该层对应的弹窗或局部 UI。

`true` 只表示请求已被接受，不表示浏览器导航已经完成。

## `BackGuard`

```ts
interface BackGuard {
  dispose(): Promise<void>
}
```

`dispose()` 结束该 Guard 的生命周期，不产生业务导航：

- 非最后一层可以立即移除。
- 最后一层会清理 sentinel，并在观察到内部 base `popstate` 后 resolve。
- 清理期间重复调用返回同一生命周期结果。
- 同步 History 操作失败且 marker 成功回滚时，本次 Promise reject，Guard 仍可再次 `dispose()`。
- 无法回滚或 sentinel 已丢失时整代 Guard fail-closed，后续调用继续 reject。

主动导航必须等待清理：

```ts
await guard.dispose()
await router.push("/next")
```

这只避免主动导航与本库 sentinel cleanup 竞争，不代表本库保证 router POP。

## 错误通道

公开 API 不提供 `onError`：

- 创建阶段的错误由 `createBackGuard()` 同步抛出。
- `dispose()` 直接触发的错误通过其 Promise rejection 返回。
- handler 未处理异常和 `popstate` 内部故障通过 `window.reportError()` 上报；不支持 `reportError` 的环境使用异步 throw 进入全局错误通道。

业务要忽略或转换 handler 错误时，应在 handler 内自行 `try/catch`。调用 `dispose()` 的代码应按业务需要 await 或 catch。

## 类型导出

包导出 `BackAttempt`、`BackGuard` 和 `BackHandler`。运行时只导出 `createBackGuard`。
