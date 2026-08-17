---
layout: home

hero:
  name: "Guard"
  text: "让返回先停一下"
  tagline: 用一条 sentinel 接住原生单步 Back，业务只需决定是否允许。
  actions:
    - theme: brand
      text: 开始使用
      link: /guide/getting-started
    - theme: alt
      text: 查看 API
      link: /api
features:
  - title: 明确的返回决策
    details: 调用 allow() 就同意当前 Back；不调用就继续保护。
  - title: 可等待的生命周期
    details: dispose() 等待 sentinel 清理；所有权已经丢失时正常结束，真实清理故障则 reject。
  - title: 原生 History API
    details: 聚焦同文档单步 Back，不假装提供 router POP 或浏览器级导航锁。
---

## 最小接入

```ts
import { createBackGuard } from "@revfanc/guard"

const guard = createBackGuard(async (allow) => {
  if (await confirmLeaving()) {
    allow()
  }
})
```

::: warning 它不是浏览器级锁
只保证协调原生、同文档、逐次单步 Back。刷新本身不会被拦截，但重新创建 Guard 时会接管当前 sentinel。Router POP、关闭、地址栏、跨文档、跨多步跳转和一次 traversal 完成前排队的多次 Back 不在保证范围内。
:::
