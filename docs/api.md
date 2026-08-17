# API

## `createBackGuard(onBack)`

```ts
function createBackGuard(onBack: BackHandler): BackGuard

type BackHandler = (
  allow: () => boolean,
) => void | PromiseLike<void>
```

在当前页面创建一层 Back Guard。首次创建会增加一条同 URL 哨兵记录；刷新后的新 Runtime 如果发现当前 sentinel，会直接接管而不重复增加记录。如果上一轮正在执行 `dispose()` 清理，新 Guard 会在清理完成后激活。

非浏览器环境、History API 不完整、handler 不是函数或当前 `history.state` 不符合契约时同步抛错。

### Handler 生命周期

用户单步返回后，库先恢复 sentinel，再调用 handler：

- handler pending 期间，逐次重复 Back 不会重复调用 handler。
- handler 完成但没有调用 `allow()`，表示拒绝本次返回；`allow` 失效，Guard 重新等待。
- 异步弹窗必须返回覆盖完整决策周期的 Promise。仅启动回调式弹窗后立即返回，会使 `allow` 立即失效。
- handler 的未处理 throw 或 rejection 会先使 `allow` 失效并保持保护，再进入浏览器全局错误通道。

## `allow()`

传给 handler 的 `allow()` 无参数，表示同意当前这次 Back：

- 只有仍有效且所属 Guard 位于顶部时返回 `true`。
- 暂停、过期、重复或已经完成的调用返回 `false`。
- 如果它属于最后一层 Guard，库先清理 sentinel，再自动继续原始 Back。
- 如果存在下层 Guard，`allow()` 只完成当前层并消费这次 Back，不会自动触发下层 handler。业务可以在调用前关闭该层对应的弹窗或局部 UI。

`true` 只表示请求已被接受，不表示浏览器导航已经完成。

## `BackGuard`

```ts
interface BackGuard {
  dispose(): Promise<void>
}
```

`dispose()` 请求结束该 Guard：

- 非最后一层可以立即移除。
- 最后一层会清理 sentinel，并在观察到带相同 generation 的 base `popstate` 后完成。
- 清理期间重复调用返回同一个 Promise。
- History ownership 已经丢失时正常完成，不会改写当前 URL 或业务 state。
- History 清理操作失败时 reject。

主动导航必须等待清理：

```ts
await guard.dispose()
await router.push("/next")
```

这只避免主动导航与本库 sentinel cleanup 竞争，不代表本库保证 router POP。

## 错误通道

公开 API 不提供 `onError`：

- 创建阶段的错误由 `createBackGuard()` 同步抛出。
- `dispose()` 直接触发的错误通过 Promise rejection 返回。
- handler 未处理异常和 `popstate` 内部故障通过 `window.reportError()` 上报；不支持 `reportError` 的环境使用定时异步 throw 进入全局错误通道。
- 外部替换 sentinel 或 Back 越过精确 base 时正常结束 Guard，不覆盖当前 URL 与业务 state，也不主动抛错。

业务要忽略或转换 handler 错误时，应在 handler 内自行 `try/catch`。主动导航前应等待 `dispose()` 完成。

## 类型导出

包导出 `BackGuard` 和 `BackHandler`。运行时只导出 `createBackGuard`。
