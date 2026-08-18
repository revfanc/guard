# iframe

默认情况下，`createGuard()` 使用当前执行环境的 Window。在 iframe 自己的脚本中调用时，会自然得到独立 Runtime：

```ts
const stop = createGuard(handler)
```

父页面也可以显式保护同源 iframe：

```ts
const frame = iframe.contentWindow
const stop = createGuard(handler, frame!)
```

每个 Window 拥有独立的 Guard 栈和缓冲记录。不要使用 `window.top` 共享 Runtime。

跨域 iframe 的 History 无法由父页面访问，必须由 iframe 内部集成本库。父页面 Guard 也不能承诺拦截子 iframe 新增的联合历史记录。
