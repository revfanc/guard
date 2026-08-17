# 工程结构与构建

## 工具职责

- tsdown：npm 库打包、ESM/CommonJS 和类型声明。
- Vitest：状态机与 History 协议单测。
- Playwright：Chromium、Firefox、WebKit 的真实浏览器验证。
- VitePress：指南与 API 文档。

## 目录

```text
guard/
├─ src/
│  ├─ index.ts             # 唯一公开入口
│  ├─ types.ts             # BackHandler / BackGuard
│  ├─ history.ts           # Adapter、Sentinel 与 History API 副作用
│  └─ runtime.ts           # active、cleaning、LIFO 与生命周期
├─ tests/
│  ├─ unit/                # 确定性的边界与异常测试
│  └─ e2e/                 # 三浏览器原生 History fixture
├─ docs/                   # VitePress 文档
├─ scripts/                # tarball、exports 与 tree-shaking 检查
└─ tsdown.config.ts        # ESM + CJS + declarations
```

只有 `src/index.ts` 是公开模块。内部保持 `idle`、`active`、`cleaning` 三阶段；公开 API 不暴露阶段、History marker 或业务导航 action。

## 核心边界

- `index.ts` 只校验公开输入和浏览器能力。
- `history.ts` 封装 `pushState`、`replaceState`、`popstate` 与 Back，不处理 Guard 栈。
- `runtime.ts` 只通过 `Adapter` 操作历史，负责 `guards`、`allow()`、`dispose()` 和错误生命周期。

## 发布约束

- `exports.import` 与 `exports.require` 分别提供 ESM/CJS 和匹配声明。
- 目标为 ES2015，不能无意依赖更晚运行时 API。
- `sideEffects: false` 要求模块导入时不安装监听器。
- 发布检查从真实 tarball 验证文件列表、入口、类型和 tree-shaking。

```bash
pnpm check
pnpm test:e2e
pnpm pack:check
```
