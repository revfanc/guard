# 生命周期

第一次 `createGuard()` 调用会：

1. 为当前 Window 创建共享 Runtime；
2. 注册一个捕获阶段的 `popstate` listener；
3. 在当前 URL 上增加一条 active 缓冲；
4. 把 Handler 压入 LIFO 栈。

单步 Back 的处理顺序：

1. 浏览器从 active 缓冲穿越到 base；
2. Runtime 立即重新 push active 缓冲；
3. 阻止本次 `popstate` 继续传播；
4. 只调用栈顶 Handler；
5. 未调用 `allow()` 时保留当前层；
6. 调用 `allow()` 时消费当前层；最后一层会释放缓冲并继续 Back。

Handler pending 时，后续顺序 Back 仍会先恢复缓冲，但不会重复派发 Handler。同一任务中已经排队的多次穿越无法完全保证。

最后一层主动停止时，active 缓冲会变为 inactive，再无监听地回到 base。停止 Promise 在 base 恢复后完成。

Runtime 在首次使用后保留到 Window 生命周期结束，用于识别并拒绝进入 inactive 缓冲的 Forward。

## 页面作用域

一个 Runtime 栈只属于当前 active 缓冲，表示当前页面上的嵌套 Guard。新页面调用 `createGuard()` 时，如果当前记录已经不属于原缓冲，Runtime 会使旧 Attempt 和旧 Guard 全部失效，再为新页面建立独立栈；不会把旧页面 Handler 迁移到新页面。

返回旧页面的 active 缓冲时，页面重新调用 `createGuard()`即可接管该记录。主动导航前仍应显式 `await stop()`；自动失效只是防止遗漏清理后发生跨页面 Handler 污染，不能替代业务生命周期。
