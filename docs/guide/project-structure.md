# 工程结构与构建

核心源码只有三层：

- `index.ts`：公开参数校验和导出；
- `guard.ts`：History 缓冲、单 Handler、异步决策和清理；
- `types.ts`：`Guard` 与 `Handler`。

`guard.ts`内部使用 `Controller`、`Session`、`Tag`、`Status`和 `Next`等单词概念。状态固定为 `stopped`、`guarding`和 `cleaning`。

状态只保存在当前模块中，不写 Window 私有属性，也不协调重复包实例。`popstate` listener 随 Guard 建立，并在停止、放行或 fail-open 时移除。

包没有运行时依赖，输出 ESM、CommonJS 及各自的 TypeScript 声明，并声明 `sideEffects: false`。

```bash
pnpm check
pnpm test:e2e
pnpm pack:check
```
