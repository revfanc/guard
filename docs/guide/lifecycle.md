# 生命周期

首层 `useGuard()` 注册时，Runtime 才会连接 Router 的 history listener、`beforeEach` 和 `afterEach`。最后一层停止或被消费，并且没有 pending 决策后，三类监听会被移除。

一次 POP 的处理顺序如下：

1. history listener 记录 `type === "pop"` 且 `delta !== 0` 的导航。
2. `beforeEach` 用目标和来源匹配这次 POP。
3. 只调用当前栈顶 Handler。
4. Handler 调用 `allow()` 且没有下层时放行，否则由 Vue Router 恢复原位置。
5. `afterEach` 清除未匹配的临时 POP 信息。

Handler pending 时，后续 POP 会按顺序拒绝，并等待 Vue Router 完成位置恢复，不会再次调用同一个 Handler。

停止当前活跃层会立即使它持有的 `allow` 失效，并拒绝当前 POP。停止其他层只会移除对应注册。

```ts
const stop = useGuard(async (allow) => {
  if (await decide()) allow()
})

stop()
stop() // 幂等
```
