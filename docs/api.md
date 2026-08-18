# API

公开运行时只导出 `createGuard` 和 `useGuard`，公开类型只导出 `Guard` 和 `Handler`。

## `createGuard(router)`

```ts
function createGuard(router: Router): Guard
```

为一个 Vue Router 实例取得共享 Runtime，并返回 Vue 插件。使用同一个 Router 创建多个插件时会共享 Runtime；不同 Router 相互隔离。插件不会修改 Router 对象。

参数不是有效 Vue Router 实例时同步抛出配置错误。

## `useGuard(handler)`

```ts
function useGuard(handler: Handler): () => void
```

在当前插件注入上下文注册一层 Guard，并返回幂等停止函数。若存在当前 Vue 作用域，会通过 `onScopeDispose()` 自动停止。

以下情况同步抛出配置错误：

- `handler` 不是函数；
- 当前 Vue 注入上下文没有安装 Guard 插件。

## `Guard`

```ts
interface Guard {
  install(app: App): void
}
```

`Guard` 是可传给 `app.use()` 的 Vue 对象插件。

## `Handler`

```ts
type Handler = (
  allow: () => void,
) => void | PromiseLike<void>
```

Handler 完成前调用 `allow()` 表示消费当前层：

- 仍有下层时，当前 POP 被拒绝，下一次 POP 再处理下一层；
- 已是最后一层时，原 POP 完成；
- 完成但没有调用 `allow()` 时，当前 POP 被拒绝且本层保留。

`allow()` 没有返回值。停止、过期或重复调用不会改变结果。

Handler 抛出的错误或返回的 rejected Promise 进入 Vue Router 的导航错误通道，可用 `router.onError()` 观察。
