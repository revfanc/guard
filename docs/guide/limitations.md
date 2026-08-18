# 边界与限制

## 支持

- Vue Router 4.5+ 和 5；
- Browser、Hash、Memory history；
- 浏览器 Back、Forward；
- `router.go(N)` / `history.go(N)` 产生的 Router POP；
- 异步决策、pending POP 拒绝和 LIFO 多层 Guard。

## 不处理

- `router.push()`；
- `router.replace()`；
- 页面刷新和关闭标签页；
- 地址栏输入；
- 跨文档导航。

这些操作不是 Vue Router POP，应分别使用 Vue Router 路由守卫、`beforeunload` 或业务导航确认机制。

## Fail-open 场景

POP 元数据缺失、目标无法匹配、redirect 或外部 History 修改导致上下文无法确认时，本库不会抛出内部异常，也不会阻断这次导航。这样可以避免库对未知业务导航造成永久阻塞。

本库不会调用 `pushState()`、`replaceState()`，也不会写入 `history.state`。

## Vue Router Alpha API

Runtime 使用 Vue Router 的 `RouterHistory.listen()`，该 API 当前在官方文档中标记为 Alpha。因此 peer 范围限制在 `<6`，并通过 Vue Router 4.5.1 与 5 的集成测试锁定行为。升级 Vue Router 大版本前应重新执行完整测试。
