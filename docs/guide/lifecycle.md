# 生命周期

第一次 `createGuard()` 调用会：

1. 监听当前 Window 的 `popstate`；
2. 创建或接管一条带私有标记的同 URL 缓冲；
3. 保存当前 Handler。

单步 Back 的处理顺序：

1. 浏览器从缓冲回到原页面记录；
2. Guard 立即重新 push 缓冲；
3. 阻止已识别的 `popstate`继续传播；
4. 调用当前 Handler；
5. 未调用 `allow()`时继续停留；
6. 调用 `allow()`时清理缓冲，回到原页面记录，再继续真实 Back。

内部状态只有三个：

```text
stopped -> guarding -> cleaning -> stopped
```

- `stopped`：没有活跃缓冲；
- `guarding`：缓冲和 Handler 正常工作；
- `cleaning`：正在回到原页面记录。

主动停止使用相同的 cleaning 流程，但清理结束后停留当前页面。监听器会随最后一个 Guard 一起移除，不会保留到 Window 销毁。

再次调用 `createGuard()`只替换 Handler并复用现有缓冲。旧停止函数完成且不能影响新 Handler。清理期间不接受新注册，调用者应先 `await stop()`。
