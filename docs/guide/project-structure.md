# 工程结构与构建

核心源码分为三层：

- `index.ts`：公开参数校验、默认 Window 选择和导出；
- `history.ts`：History state、active/inactive 缓冲及 `popstate`；
- `runtime.ts`：Window 级共享 Runtime、Item 栈、Attempt 和异步停止。

每个目标 Window 通过不可枚举的 `Symbol.for("@revfanc/guard.runtime.v1")` 属性共享 Runtime，从而协调重复模块、HMR 和同一页面的多次注册。不同 Window，包括 iframe，彼此隔离。

Handler、Item 栈和 pending Attempt 只存在于内存。可序列化的 active/inactive 标记才会写入缓冲记录的 `history.state`。

包没有运行时依赖，输出 ESM、CommonJS 及各自的 TypeScript 声明，并声明 `sideEffects: false`。

```bash
pnpm check
pnpm test:e2e
pnpm pack:check
```
