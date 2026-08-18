---
layout: home

hero:
  name: "Guard"
  text: "让 Vue Router 的 POP 先做决定"
  tagline: 用插件绑定 Router，在组件中用一层 Guard 处理 Back、Forward 和 go(N)。
  actions:
    - theme: brand
      text: 开始使用
      link: /guide/getting-started
    - theme: alt
      text: 查看 API
      link: /api
features:
  - title: Vue Router 原生语义
    details: 只识别 RouterHistory 的 POP，由 beforeEach 返回 false 或放行原导航。
  - title: 组件作用域
    details: useGuard 返回幂等停止函数，并通过 onScopeDispose 自动清理。
  - title: 多层 LIFO
    details: 每次 POP 只交给栈顶 Handler，适合对话框和嵌套流程逐层关闭。
---

## 最小接入

```ts
import { useGuard } from "@revfanc/guard"

useGuard(async (allow) => {
  if (await confirmLeaving()) allow()
})
```

::: warning 能力边界
本库只处理 Vue Router POP：Back、Forward 和 `go(N)`。`push`、`replace`、刷新、地址栏和跨文档导航不在处理范围内。
:::
