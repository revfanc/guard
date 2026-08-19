# API

运行时只导出 `createGuard`，公开类型只有 `Guard` 和 `Handler`。

## `createGuard(handler)`

```ts
function createGuard(handler: Handler): Guard
```

在当前浏览器 Window 注册 Handler，并创建或接管一条同 URL 缓冲。一个 Window 同时只有一个 Handler；再次调用会替换旧 Handler，但不会增加第二条缓冲。

旧 Guard 的停止函数在被替换后立即完成，调用它不会停止新 Handler。

以下情况同步抛出配置错误：

- `handler` 不是函数；
- 当前执行环境没有可用的浏览器 History API。

History 冲突、写入失败、未知穿越和不支持的 state 会 fail-open：当前 Guard 结束，未知导航继续，不抛库内部异常。

## `Guard`

```ts
interface Guard {
  (): Promise<void>
}
```

Guard 是幂等的异步停止函数。重复调用返回同一个 Promise。Promise 在缓冲回到无私有标记的页面记录后完成。

主动执行路由跳转、`pushState`、`replaceState` 或文档导航前，必须先等待停止：

```ts
await stop()
router.push("/next")
```

停止完成后再创建新 Guard。清理尚未完成时调用 `createGuard()`不会排队建立新缓冲。

## `Handler`

```ts
type Handler = (
  allow: () => void,
) => void | PromiseLike<void>
```

- Handler 完成前调用 `allow()`：清理缓冲并继续真实 Back；
- 没有调用 `allow()`：保留 Guard 并停留当前页面；
- Handler pending：后续顺序 Back 不重复调用 Handler；
- Handler 完成、停止、被替换或重复调用后，旧 `allow()`失效。

Handler 抛出的错误或 rejected Promise 通过当前 Window 的 `reportError()`报告；不支持该方法时异步抛出。Guard 保持可用。
