# API

## `createBackGuard(options)`

```ts
function createBackGuard(options: BackGuardOptions): BackGuard
```

在当前浏览器页面压入一个 guard。通常会立即建立一条同 URL 哨兵记录；如果前一代正在执行无 action cleanup，则新 guard 先进入 restart 队列，等内部遍历回到 base 后才建立哨兵并激活。SSR、非浏览器环境或所需 History API 不完整时抛出错误。

### `BackGuardOptions`

```ts
interface BackGuardOptions {
  onBack(attempt: BackAttempt): void | PromiseLike<void>
  onError?(error: unknown): void
}
```

`onBack` 在当前 guard 第一次收到返回意图时调用。attempt 尚未决策时，重复返回不会重复调用它。即使 `onBack` 返回的 PromiseLike 尚未完成，只要 attempt 已经解决，下一次返回仍可产生新的 attempt。

同步异常和 rejected Promise 会在 attempt 尚未解决时自动静默解决它、使 guard 重新等待，再交给 `onError`。如果 attempt 已经解决，则只报告错误，不改写 first-call-wins 的结果。未配置 `onError` 时，错误可能进入浏览器全局 `error` 或 `unhandledrejection` 通道；具体通道取决于浏览器的全局错误报告实现，业务异常不会导致意外放行。

## 统一的 `resolve`

Attempt 与 Guard 只有同一个解决动作：

```ts
resolve(): boolean
resolve(action: () => void | PromiseLike<unknown>): boolean
```

- 不传 action：静默解决当前对象，不执行业务动作。
- 传入 action：提交当前对象，并在它能够安全完成时执行一次 action。
- 返回值只表示请求的 resolution 是否被接受，不表示 action 已执行，也不表示 action 发起的导航已完成。`false` 不保证句柄仍可重试：sentinel 丢失或无法回滚的 History 失败会同时使整代 guard fail-closed。
- 同一个对象采用 first-call-wins：第一次被接受的调用决定结果，之后调用返回 `false`。

公开类型使用两个 overload，而不是可选参数。`resolve(undefined)` 不是“静默解决”的合法写法，避免一个可能为 `undefined` 的变量意外改变控制流。

### `BackAttempt`

```ts
interface BackAttempt {
  resolve(): boolean
  resolve(action: () => void | PromiseLike<unknown>): boolean
}
```

- `attempt.resolve()` 结束当前提示、拒绝这次返回，并让同一个 guard 等待下一次单步返回。
- `attempt.resolve(action)` 接受这次返回并完成当前 guard，在安全时机执行一次业务动作。
- Attempt 只有在仍然有效且所属 guard 位于栈顶时才能解决。暂停、已完成或旧 attempt 返回 `false`，且不会执行 action。
- 最后一层调用 `attempt.resolve(action)` 时，库先从哨兵回到受保护业务记录，再执行 action。库不会自动再调用一次 `history.back()`。
- 非最后一层调用 `attempt.resolve(action)` 只完成该层并执行该层动作；它不会调用下层 `onBack`，也不会替下层作决定。

`action` 可以是 `() => history.back()`、`() => location.replace(...)`、路由跳转回调或普通业务函数。同步返回值会被忽略；如果返回 PromiseLike，其 rejected 原因会交给同一错误通道。涉及 router 时须接受其[非保证边界](./guide/limitations)。

### `BackGuard`

```ts
interface BackGuard {
  resolve(): boolean
  resolve(action: () => void | PromiseLike<unknown>): boolean
}
```

- `guard.resolve()` 只结束该 guard 的生命周期，不执行业务动作。静默解决可以用于任意栈层；移除栈顶后，被暂停的下层 attempt 恢复有效，且不会重复调用下层 `onBack`。
- `guard.resolve(action)` 表达主动、安全地完成这一层。它只在 guard 位于栈顶时被接受；非栈顶调用返回 `false`，action 不执行。
- 非最后一层的 actionful resolve 移除栈顶并执行这一层 action。最后一层则先回到受保护 base，再执行 action。

主动 router 导航必须把导航放进 action，不能先静默解决再单独跳转：

```ts
guard.resolve(() => router.push("/next"))
```

最后一层 actionful resolve 返回 `true` 后，决定不可撤回。内部遍历完成前创建新 guard 会同步抛错；错误不会交给这个尚未创建的 guard。后续 `resolve()` 不会取消 action。目标 `popstate` 到达时，runtime 会先切到 idle，再调用 action，所以 action 内可以创建下一代 guard；它不等待 action 返回的 PromiseLike 完成。

最后一层静默 `resolve()` 始终发起一次内部同文档遍历，但不提交业务 action。清理期间新的 `createBackGuard()` 可以排队；排队句柄尚未开始保护页面，在激活前只能用无 action 的 `resolve()` 静默取消。`resolve(action)` 此时返回 `false`，可以等该 guard 激活并成为栈顶后重试。这个机制支持快速 unmount → mount 或 resolve → recreate，但不承诺在旧 cleanup 与新 sentinel 之间拦截并发 Back；一次遍历完成前排队多次 Back 明确不受支持。只有 actionful 的不可撤销遍历会拒绝 recreate。

## 类型导出

包导出 `BackAction`、`BackResolution`、`BackAttempt`、`BackGuard` 和 `BackGuardOptions`。`BackAttempt` 与 `BackGuard` 都是统一 `BackResolution` 契约的语义别名。
