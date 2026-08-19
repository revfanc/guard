# API

运行时只导出 `createGuard`，公开类型只有 `Guard` 和 `Handler`。

## `createGuard(handler, target?)`

```ts
function createGuard(
  handler: Handler,
  target?: Window,
): Guard
```

立即在目标 Window 的 Runtime 栈顶注册一层 Guard。省略 `target` 时使用当前浏览器 `window`。

传入同源 iframe 的 `contentWindow`，可以显式保护该 iframe：

```ts
const stop = createGuard(handler, iframe.contentWindow!)
```

以下情况同步抛出配置错误：

- `handler` 不是函数；
- 没有可用的浏览器 Window；
- `target` 不是同源且可访问的 Window，或不具备 History API。

History 状态冲突、History 写入失败和未知穿越不会抛出库内部异常，而是 fail-open，并结束无法确认归属的 Guard 作用域。

## `Guard`

```ts
interface Guard {
  (): Promise<void>
}
```

Guard 是幂等的异步停止函数。重复调用返回同一个 Promise。最后一层停止时，Promise 会在同 URL 缓冲恢复到 base 后完成。

主动执行路由跳转、`pushState`、`replaceState` 或文档导航前，应先等待停止：

```ts
await stop()
router.push("/next")
```

## `Handler`

```ts
type Handler = (
  allow: () => void,
) => void | PromiseLike<void>
```

Handler 完成前调用 `allow()` 表示消费当前层：

- 还有其他层：留在当前页面，下一次 Back 再处理新的栈顶；
- 已是最后一层：释放缓冲并继续真实 Back；
- Handler 完成但没有调用 `allow()`：保留当前层并停留当前页面。

`allow()` 无返回值；停止、完成或重复调用后失效。Handler 抛出的错误或 rejected Promise 通过目标 Window 的 `reportError()` 报告，Guard 本身继续保留。
