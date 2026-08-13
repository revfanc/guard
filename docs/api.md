# API

## `isBackGuardSupported()`

```ts
function isBackGuardSupported(): boolean
```

无副作用地检查当前环境是否提供库需要的浏览器 History API。SSR 或能力不完整时返回 `false`；它不会安装监听器或创建哨兵。

## `createBackGuard(options)`

```ts
function createBackGuard(options: BackGuardOptions): BackGuard
```

在当前浏览器页面压入一个 guard，并确保页面上存在一条同 URL 哨兵记录。SSR、非浏览器环境或所需 History API 不完整时抛出错误。

### `BackGuardOptions`

```ts
interface BackGuardOptions {
  onBack(attempt: BackAttempt): void | Promise<void>
  onError?(error: unknown): void
}
```

`onBack` 在当前 guard 第一次收到返回意图时调用。Promise 尚未完成或 attempt 尚未决策时，重复返回不会重复调用它。

同步异常和 rejected Promise 会自动执行一次 stay、使原 attempt 失效，再交给 `onError`。未配置 `onError` 时，错误通过浏览器全局错误通道报告；业务异常不会导致意外放行。

### `BackAttempt`

```ts
interface BackAttempt {
  stay(): boolean
  done(action: () => void | Promise<void>): boolean
}
```

- `stay()` 结束当前提示并让 guard 等待下一次单步返回。
- `done(action)` 完成当前 guard，并在安全时机执行一次业务动作。
- 两者仅在这个 attempt 当前有效且位于栈顶时返回 `true`；暂停、已完成或旧 attempt 返回 `false`，且不会执行 `action`。
- 最后一层调用 `done(action)` 时，库先从哨兵回到受保护业务记录，再执行 `action`。库不会自动再调用一次 `history.back()`。
- 非最后一层调用 `done(action)` 只完成该层并执行该层动作；它不会调用下层 `onBack`，也不会替下层作决定。

`action` 可以是 `history.back()`、`location.replace(...)`、路由跳转或普通业务函数。涉及 router 时须接受其[非保证边界](./guide/limitations)。

### `BackGuard`

```ts
interface BackGuard {
  dispose(): void
}
```

`dispose()` 同步、幂等，只表达该 guard 生命周期结束，不执行 `done` 的业务动作。销毁栈顶 guard 后，被它暂停的下层 attempt 会恢复有效，且不会重复调用下层 `onBack`。

## 类型导出

包导出 `BackAttempt`、`BackGuard` 和 `BackGuardOptions`。
