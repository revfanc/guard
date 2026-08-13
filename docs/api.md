# API

## `createBackGuard(options)`

创建并压入一个返回 guard。浏览器或 History API 不可用时会抛出错误。

### `BackGuardOptions`

```ts
interface BackGuardOptions {
  onBack(attempt: BackAttempt): void | Promise<void>
  onError?(error: unknown): void
}
```

### `BackAttempt`

```ts
interface BackAttempt {
  readonly source: "history" | "cascade"
  leave(): boolean
  reset(): boolean
}
```

- `history` 表示浏览器按钮或 `history.back()` 触发。
- `cascade` 表示上层 guard 已放行，同一返回意图继续向下传递。
- `leave()` 和 `reset()` 只在 attempt 仍是当前栈顶时返回 `true`。

### `BackGuard`

```ts
interface BackGuard {
  readonly status: "armed" | "triggered" | "disposed"
  dispose(): void
}
```

## `isBackGuardSupported()`

检测当前环境是否具有创建 guard 所需的 `window` 与 History API。SSR 环境返回 `false`。

## 类型导出

包同时导出 `BackAttempt`、`BackAttemptSource`、`BackGuard`、`BackGuardOptions` 和 `BackGuardStatus`。
