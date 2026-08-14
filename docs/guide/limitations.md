# 浏览器与 state 边界

`@revfanc/guard` 使用原生 History API 协调返回行为，不是浏览器级导航锁。`popstate` 到达时历史游标已经改变，事件不能像普通 DOM 默认行为那样被取消。

## 支持范围

- 用户逐次触发的一次同文档返回。
- 一次 `history.back()` 或 `history.go(-1)`。
- 异步业务决策期间不重复调用 `onBack`。
- 多 guard 的 LIFO 暂停与恢复。

## 不保证处理

- 刷新、关闭标签页、`beforeunload`。
- 地址栏、普通链接和跨文档导航。
- 长按返回后选择任意历史记录。
- `history.go(-2)` 等跨多条记录跳转。
- 一次遍历完成前排队多次返回。
- forward，或 guard 存活期间由其他代码调用 `pushState` / `replaceState`。
- 浏览器因尚无用户交互等策略而不发送 `popstate`。

History API 没有当前游标或遍历完成 Promise，因此最后一层 `resolve(action)` 只能在观察到内部 sentinel 回到业务 base 后运行 action，不能承诺 action 本身的导航完成。

上述“排队多次返回”是硬边界：`popstate` 发生时游标已经移动，库无法取消浏览器已经排队的后续 traversal。在无 action cleanup 中同步 recreate 得到的 guard 也要等 base `popstate` 后才激活；在此之前立即再次 Back 可能越过单哨兵。

如果浏览器静默抑制预期的 `popstate`：

- 无 action cleanup 会保持 `traversing/restart`，期间排队的 guard 不会激活；
- actionful traversal 会保持 `traversing/action`，action 不会执行，新的 guard 创建会继续被拒绝。

库不会使用 timeout 或 `history.length` 猜测遍历结果。

## `history.state` 契约

首次创建 guard 时，`history.state` 必须是：

- `null`；或
- 可扩展的普通对象，并且没有库的保留字段 `__revfanc_guard__`。

以下输入会同步抛错：primitive、数组、`Map`、`Set`、类实例、冻结/密封/不可扩展对象，以及已包含保留字段的对象。

库借助浏览器原生 structured clone 建立哨兵记录，因此合法 state 中的业务字段、共享引用和循环引用由浏览器负责复制。库不会把任意 JavaScript 对象自行序列化成另一种形态。

最后一个 guard 静默 `resolve()` 时，库会从当前记录清除 marker、保留业务 state 与 URL，并通过一次同文档遍历回到受保护 base。History API 无法删除已创建的历史项，清理也不承诺恢复 `history.length`；清理后的同 URL 重复项可能留在 forward history，后续新 push 由浏览器按原生规则截断 forward entries。

## Router 边界

Vue Router、React Router 等路由器会自行读写 `history.state` 并注册 `popstate` 监听器。这个包不代理 router，也不保证：

- router POP 与 guard 内部 POP 的观察顺序；
- Browser/Hash 模式下无短暂路由更新；
- router 写入的 state 总是满足上述严格输入契约。

框架文档只展示组件生命周期。需要可靠拦截应用内所有路由跳转时，请使用 router 自身的 blocker / navigation guard。

主动 `router.push` 可以作为 `guard.resolve(action)` 的 action，在本库完成 sentinel 协调后执行：

```ts
guard.resolve(() => router.push("/next"))
```

这只保证本库不会让该 push 与自己的 cleanup 竞争，不会扩大为 Router POP、监听器顺序或完整应用导航阻塞承诺。
