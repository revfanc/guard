# 浏览器与 state 边界

`@revfanc/guard` 使用原生 History API 协调返回行为，不是浏览器级导航锁。`popstate` 到达时历史游标已经改变，事件不能像普通 DOM 默认行为一样被取消。

## 支持范围

- 用户逐次触发的一次同文档返回。
- 一次 `history.back()` 或 `history.go(-1)`。
- 异步决策期间合并重复 handler 调用。
- 多 Guard 的 LIFO 暂停、恢复和生命周期清理。

## 不保证处理

- 拦截刷新、关闭标签页、`beforeunload`。
- 地址栏、普通链接和跨文档导航。
- 长按返回后选择任意历史记录。
- `history.go(-2)` 等跨多条记录跳转。
- 一次 traversal 完成前排队多次 Back。
- forward，或 Guard 存活期间由其他代码调用 `pushState` / `replaceState`。
- 浏览器因交互策略等原因不发送预期 `popstate`。

排队多次 Back 是硬边界：浏览器先移动历史游标，库无法取消已经排队的后续 traversal。在 `dispose()` cleanup 中同步创建的新 Guard 也要等 base `popstate` 后才激活；此前立即再次 Back 可能越过单 sentinel。

如果预期 `popstate` 未出现，`dispose()` Promise 不会完成，排队 Guard 也不会激活。库不会用 timeout 或 `history.length` 猜测遍历成功。

## `history.state` 契约

首次创建 Guard 时，`history.state` 必须是：

- `null`；或
- 可扩展的普通对象。

primitive、数组、`Map`、`Set`、类实例、冻结/密封/不可扩展对象会同步抛错。业务已有的同名字段会被保留，库改用独立的备用 marker 字段。

刷新不会被 Guard 拦截。刷新后旧 handler 和 Guard 栈已经消失；应用重新调用 `createBackGuard()` 时，库会接管当前兼容 sentinel，不再调用 `pushState`。应用仍需按原顺序重建所需 Guard。

库依靠浏览器原生 structured clone 创建 sentinel，因此合法 state 中的业务字段、共享引用和循环引用由浏览器复制。最后一个 Guard `dispose()` 时，库清除 marker、保留业务 state 与 URL，再遍历回受保护 base。History API 无法删除历史项，因此不承诺恢复 `history.length`。

## Router 边界

Vue Router、React Router 等路由器会自行读写 `history.state` 并注册 `popstate` 监听器。本包不代理 router，也不保证：

- router POP 与本库 POP 的观察顺序；
- router 导航守卫与本库 handler 的先后；
- Browser/Hash 模式没有短暂路由更新；
- router 写入的 state 始终满足上述契约。

同一个 `window` 上，capture listener 不能越过更早注册的监听器；`stopImmediatePropagation()` 也只能阻止排在本库之后的监听器。因此需要可靠拦截应用内路由跳转时，必须使用 router 自身的 navigation guard / blocker。

主动 push 可以在本库清理完成后执行：

```ts
await guard.dispose()
await router.push("/next")
```

这只避免主动导航与 sentinel cleanup 竞争，不扩大为 router POP 兼容承诺。
