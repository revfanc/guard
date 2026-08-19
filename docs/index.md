---
layout: home

hero:
  name: "Guard"
  text: "让浏览器 Back 先经过业务回调"
  tagline: 不依赖框架，用一个同 URL 缓冲处理第一次单步 Back。
  actions:
    - theme: brand
      text: 开始使用
      link: /guide/getting-started
    - theme: alt
      text: 查看 API
      link: /api
features:
  - title: 框架无关
    details: 不依赖 Vue、React 或路由器，可用于任意浏览器应用。
  - title: 第一次 Back
    details: 建立一条同 URL 缓冲，直接进入页面后的第一次 Back 也能触发 Handler。
  - title: 单一 Handler
    details: 一个 Window 同时只有一个 Handler，新注册直接替换旧注册，不增加 History 记录。
---

## 最小接入

```ts
import { createGuard } from "@revfanc/guard"

const stop = createGuard(async (allow) => {
  if (await confirmLeaving()) allow()
})

await stop()
```

::: warning 能力边界
只保证当前 Window 的单步浏览器 Back 或 `history.go(-1)`。多步穿越、地址栏、刷新动作、关闭标签页、Forward 和 iframe 联合 History 变化不在保证范围。
:::
