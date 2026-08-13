# 工程结构与构建

## 工具选择

本库使用 **tsdown** 构建发布产物。它以 Rolldown 为底层，面向 TypeScript 库提供 ESM、CommonJS、声明文件与 source map 输出；相比直接用 Vite 的 library mode，双格式与类型产物所需配置更少。

Vite 继续负责浏览器测试 fixture，VitePress 负责文档站。职责保持分离：

- tsdown：npm 库打包与类型产物。
- Vitest：纯逻辑和 History API 状态机单测。
- Playwright：Chromium、Firefox、WebKit 的真实浏览器兼容验证。
- VitePress：指南与 API 文档。

## 推荐目录

```text
guard/
├─ src/
│  ├─ index.ts             # 唯一公开入口与导出
│  ├─ types.ts             # 稳定的公开类型
│  ├─ history-state.ts     # 哨兵 state 校验与标记
│  └─ runtime.ts           # guard 栈与单步遍历协调
├─ tests/
│  ├─ unit/                # 快速、确定性的边界与异常测试
│  └─ e2e/
│     ├─ fixture/          # 纯原生 History API 小应用
│     └─ specs/            # 三浏览器用户行为测试
├─ docs/                   # VitePress 文档
├─ scripts/                # tarball / exports 发布检查
├─ tsdown.config.ts        # ESM + CJS + declarations，target ES2015
├─ tsconfig.json           # 编辑器、源码和测试类型规则
├─ tsconfig.build.json     # 发布构建的 ES2015 边界
├─ vitest.config.ts        # 单元测试
├─ playwright.config.ts    # 浏览器矩阵
└─ package.json            # exports、sideEffects 与发布脚本
```

实现文件可以继续按复杂度拆分，但只有 `src/index.ts` 是包的公开边界。内部模块不应成为隐式 deep import 契约。

## 发布约束

- `exports.import` 指向 ESM，`exports.require` 指向 CommonJS，并为两者提供匹配的声明文件。
- 编译目标为 ES2015；源码与最终产物均不能无意依赖 `Array.prototype.at`、`Promise.allSettled` 等更晚的运行时 API。
- `sideEffects: false` 要求模块顶层不安装监听器。只有实际调用 `createBackGuard()` 才创建运行时，因此未使用导出可以被 Tree Shaking。
- `prepack` 在打包 npm tarball 前重新构建；发布检查应从 tarball 验证 ESM、CJS、类型入口与实际文件清单。

本地提交前运行：

```bash
pnpm check
pnpm test:e2e
pnpm pack:check
```
