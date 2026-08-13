# 浏览器限制

`@revfanc/guard` 使用 History API 协调返回行为，不是浏览器级导航锁。

## v1 可以处理

- 浏览器返回按钮产生的单步同文档返回。
- `history.back()` 与 `history.go(-1)`。
- 同一页面内多个 guard 的 LIFO 决策。
- Vue Router、React Router 的 Browser/Hash 常见模式。

## v1 不处理

- 刷新、关闭标签页和 `beforeunload`。
- 地址栏输入、普通链接或跨文档导航。
- 长按返回按钮后直接选择某条历史记录。
- `history.go(-2)` 等跨多条记录跳转。
- 前进按钮或业务主动调用 `pushState/replaceState` 后仍自动维持保护。

部分浏览器在页面尚未发生用户交互时可能不发送 `popstate`。此外，事件触发时历史位置已经改变，所以库必须立即补回哨兵；不能像取消 DOM 事件一样真正取消历史遍历。

## 路由生命周期

Guard 不代理原生 history 方法。通过普通前进导航、路由链接或编程式路由离开之前，业务必须调用 `dispose()`。如果业务需要拦截所有路由导航，应结合路由器自身的 navigation blocker 使用。
