# 生命周期

公开 API 不暴露内部状态。业务只需要管理 guard 句柄和当前 `BackAttempt`。

## `stay()`

`stay()` 结束当前返回提示并重新等待。成功返回 `true`；已经结束、被上层 guard 暂停或过期的 attempt 返回 `false`。

## `done(action)`

`done(action)` 完成当前 guard。`action` 由业务定义：

```ts
done(() => history.back())
done(() => location.replace("/safe"))
```

最后一层 guard 会先完成内部哨兵到业务记录的遍历，再执行 action。这样 action 不会与内部清理竞争。库不会猜测业务应返回、替换还是打开其他页面。

如果上方还有 guard，当前 attempt 会暂停。暂停时 `stay()` 与 `done()` 返回 `false`；上方 guard 被同步销毁后，原 attempt 恢复有效，不会重复调用 `onBack`。

## `dispose()`

`dispose()` 同步、幂等，仅表示生命周期结束：

```ts
return () => guard.dispose()
```

它不会运行 `done` action，也不会等待或承诺一次浏览器导航完成。

## 错误

`onBack` 的同步异常与 rejected Promise 会自动 stay，使原 attempt 失效，然后交给 `onError`。action 的异常同样通过错误通道报告；已经 done 的 guard 不会因此重新创建。业务不应把 guard 当作浏览器级导航锁。
