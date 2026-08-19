# 边界与限制

## 支持

- 当前 Window 的浏览器 Back；
- `history.go(-1)`；
- 直接从外部文档进入后的第一次单步 Back；
- 一个异步 Handler；
- pending 去重和失效 `allow()`；
- active 缓冲刷新接管；
- 幂等、可等待停止；
- Chromium、Firefox 和 WebKit。

## 固定代价

首次注册通过 `history.pushState()`增加一条同 URL 缓冲，因此会截断已有 Forward 栈。

缓冲记录使用私有 `__revfanc_guard__`字段。原页面记录不写私有标记。普通 `null`或 plain-object 业务 state 会复制到缓冲中。

停止后，已清理的同 URL 记录可能暂时留在 Forward 方向。库不处理 Forward；后续 `pushState()`或新的 Guard 会自然截断该记录。

## 不保证

- 多 Handler 或 LIFO 栈；
- `history.go(-N)`等多步穿越；
- 同一任务中已排队的多次 Back；
- Forward；
- 地址栏输入、刷新动作本身和关闭标签页；
- 任意多步跨文档穿越；
- iframe 联合 History 协调；
- 重复包实例或 HMR 全局协调；
- primitive、Array、Date、Map 等非 plain-object 根 state；
- Guard 活跃时未经清理直接执行 `pushState`、`replaceState` 或路由导航。

主动导航前应执行：

```ts
await stop()
```

## fail-open

URL 不匹配、保留字段冲突、外部 History 修改、state 不支持或写入失败时，库不抛内部异常，也不阻止未知导航。当前 Handler 和停止 Promise 会结束。
