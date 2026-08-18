# 工程结构与构建

核心源码保持三层：

- `index.ts`：Vue 插件、注入、作用域清理和公开导出；
- `router.ts`：把 Vue Router history、`beforeEach`、`afterEach` 适配为内部接口；
- `runtime.ts`：Item 栈、Attempt 决策和 pending POP 协调。

Runtime 通过 `globalThis` 上的全局 `WeakMap` 按 Router 实例共享，支持重复模块和 HMR，同时不在 Router 对象上附加字段。Router 被垃圾回收后，对应 Runtime 也不会被注册表强引用。

构建输出包含 ESM、CommonJS 和各自的类型声明。包声明 `sideEffects: false`，Vue 与 Vue Router 均为 peer dependency。

```bash
pnpm check
pnpm test:e2e
pnpm pack:check
```
