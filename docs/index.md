---
layout: home

hero:
  name: "Guard"
  text: "让返回先停一下。"
  tagline: 一条哨兵记录，一个明确决策。用框架无关的 TypeScript 接住浏览器返回，再由业务决定留下或离开。
  actions:
    - theme: brand
      text: 开始使用
      link: /guide/getting-started
    - theme: alt
      text: 查看 API
      link: /api
features:
  - title: 一条记录
    details: 多个 guard 共享同一条同 URL 哨兵，不让历史栈随业务层数持续膨胀。
  - title: 明确决策
    details: 返回尝试交给业务；调用 leave 放行，或调用 reset 等待下一次尝试。
  - title: 框架无关
    details: 零运行时依赖，兼容原生页面及 Vue Router、React Router 常见 history 模式。
---

## 最小接入

```ts
import { createBackGuard } from "@revfanc/guard"

const guard = createBackGuard({
  onBack({ leave, reset }) {
    openConfirm({ onConfirm: leave, onCancel: reset })
  },
})
```

::: warning 它不是浏览器级锁定
History API 只能处理同文档、单步返回。关闭标签页、刷新、地址栏导航、长按历史选择和跨多步跳转不在 v1 的能力范围内。
:::
