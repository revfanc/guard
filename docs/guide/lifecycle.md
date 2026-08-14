# 生命周期

公开 API 不暴露内部状态。业务只需要管理 guard 句柄和当前 `BackAttempt`；二者都通过同一个方法解决：

```ts
resolve(): boolean
resolve(action: () => void | PromiseLike<unknown>): boolean
```

## 统一心智模型

`resolve()` 永远表示“静默解决当前对象”，`resolve(action)` 永远表示“提交当前对象，并在安全时机执行一次 action”。区别只在于接收者：

| 调用 | 结果 |
| --- | --- |
| `attempt.resolve()` | 拒绝本次返回，guard 重新等待 |
| `attempt.resolve(action)` | 接受本次返回，完成所属 guard |
| `guard.resolve()` | 结束 guard 生命周期，不执行业务导航 |
| `guard.resolve(action)` | 主动完成 guard，并安全执行 action |

接口声明为两个 overload，而不是 `action?`。不要传入 `undefined` 代表静默解决；这可以避免可选变量意外把“提交”变成“停留”。

## 返回值与 first-call-wins

`resolve` 返回的 boolean 只表示请求的 resolution 是否被接受：

- 第一次符合当前栈和生命周期约束的调用返回 `true`。
- 同一个 attempt 或 guard 已经解决后，后续调用返回 `false`。
- 暂停、过期或不在栈顶的 actionful 调用返回 `false`，action 不会执行。
- 返回 `true` 不表示 action 已经运行，更不表示 action 发起的导航已经完成。
- 返回 `false` 也不保证句柄仍可重试；sentinel 被替换或同步 History 失败无法回滚时，runtime 会 fail-closed 并使这一代句柄全部失效。

被接受的 action 最多执行一次。同步返回值会被忽略；PromiseLike 的 rejection 会交给错误通道，库不会等待它所发起的业务导航完成。

## Attempt

用户 Back 后，库恢复 sentinel，再向栈顶 guard 交付一个 attempt：

```ts
async onBack(attempt) {
  if (!(await confirmLeaving())) {
    attempt.resolve()
    return
  }

  attempt.resolve(() => history.back())
}
```

无 action 的解决结束当前提示，同一个 guard 重新进入等待。带 action 的解决完成该层；若它是最后一层，库先从 sentinel 回到受保护 base，再执行 action。

如果上方出现新 guard，当前 attempt 会暂停。暂停期间 resolve 返回 `false`；上方 guard 静默解决后，原 attempt 恢复有效，且不会重复调用 `onBack`。

## Guard

组件生命周期结束时静默解决：

```ts
return () => guard.resolve()
```

静默 `guard.resolve()` 可以移除任意栈层。它会使该层尚未解决的 attempt 失效；移除栈顶后，下层被暂停的 attempt 恢复。

主动导航使用 actionful overload：

```ts
guard.resolve(() => router.push("/next"))
guard.resolve(() => location.replace("/safe"))
```

`guard.resolve(action)` 只允许当前栈顶调用。非栈顶调用返回 `false`，既不移除 guard，也不执行 action。非最后一层成功提交后只移除该层并执行它的局部 action；最后一层则先完成内部 sentinel 遍历。

不要先调用 `guard.resolve()` 再单独导航。前者可能开始静默 cleanup，紧接着写入 History 会与它竞争。

## 三个内部阶段

内部阶段不作为 API 暴露，但解释了为什么两种 overload 的 recreate 行为不同：

```text
idle
  └─ createBackGuard() → anchored

anchored
  ├─ final resolve()       → traversing/restart → anchored / idle
  └─ final resolve(action) → traversing/action  → idle
```

- `idle`：没有活动 sentinel 或 guard。
- `anchored`：sentinel 位于当前记录，LIFO guard 栈正常工作。
- `traversing`：已经发起回到 base 的内部遍历。`restart` 模式来自无 action 解决；新 guard 可以排队，但返回的句柄要等 base `popstate` 后重建 sentinel 才真正激活。排队句柄可以用 `resolve()` 静默取消，`resolve(action)` 返回 `false`。`action` 模式来自带 action 的最终提交；决定不可撤销，此时 `createBackGuard()` 同步抛错。目标 `popstate` 到达后 runtime 先切到 idle，再调用 action，因此 action 内可以创建下一代 guard。

History API 没有遍历完成 Promise。若浏览器不产生预期 `popstate`，`restart` 中的排队工作不会激活；`action` 中的业务 action 不会执行。库不会用 timeout 猜测完成。

排队 guard 尚未激活的窗口不提供并发 Back 保护。浏览器会先移动历史游标，`popstate` 不能取消已经排队的后续 traversal；因此一次 traversal 完成前连续调用多次 `history.back()` 可能越过单哨兵，这是明确的非支持范围。

## 错误

`onBack` 的同步异常与 rejected Promise 会在 attempt 尚未解决时等价于静默解决：业务继续留在页面，原 attempt 失效，然后错误交给 `onError`。若 attempt 已经解决，则只报告错误，不改写既有结果。Action 的异常同样通过错误通道报告；已经提交的 guard 不会因此重新创建。

未配置 `onError` 时，错误可能进入浏览器全局 `error` 或 `unhandledrejection` 通道。业务不应把 guard 当作浏览器级导航锁。
