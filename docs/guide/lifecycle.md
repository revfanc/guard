# 生命周期

一个 guard 只有三个状态：

| 状态 | 含义 |
| --- | --- |
| `armed` | 等待下一次返回尝试 |
| `triggered` | 已通知业务；继续拦截，但不重复调用回调 |
| `disposed` | 已退出 guard 栈，不能再次使用 |

## reset

`reset()` 将当前 guard 从 `triggered` 恢复为 `armed`。只有当前 attempt 可以成功调用；成功返回 `true`。

## leave

`leave()` 放行当前 guard。如果下面还有 guard，同一返回意图会以 `source: "cascade"` 传递给下一层；全部放行后才真正返回上一条业务记录。

## dispose

`dispose()` 只表达生命周期结束，不表达返回意图。它是幂等的，可以安全地放进卸载清理函数。

## 错误

同步异常与 rejected Promise 都会交给 `onError`，guard 仍保持 `triggered`，避免业务异常导致用户意外离开。未配置 `onError` 时，错误会通过浏览器全局错误通道报告。
