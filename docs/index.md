---
layout: home

hero:
  name: "Guard"
  text: "让返回先停一下。"
  tagline: 用一条哨兵记录接住原生单步返回，再由业务决定留下或执行离开动作。
  actions:
    - theme: brand
      text: 开始使用
      link: /guide/getting-started
    - theme: alt
      text: 查看 API
      link: /api
features:
  - title: 原生 History API
    details: 聚焦同文档、单步返回，不假装成为浏览器或路由器级导航锁。
  - title: 明确决策
    details: Attempt 与 Guard 都用 resolve；无 action 静默结束，有 action 时安全提交业务定义的动作。
  - title: 小而可发布
    details: 零运行时依赖，兼容 ES2015，同时提供 ESM、CommonJS 与类型声明。
---

## 最小接入

```ts
import { createBackGuard } from "@revfanc/guard"

const guard = createBackGuard({
  async onBack(attempt) {
    if (await confirmLeaving()) {
      attempt.resolve(() => history.back())
      return
    }

    attempt.resolve()
  },
})
```

::: warning 它不是浏览器级锁定
只保证协调原生、同文档、逐次单步返回。Router POP、关闭、刷新、地址栏、跨文档、跨多步跳转和一次 traversal 完成前排队的多次 Back 不在保证范围内。
:::
