# 边界与限制

## 支持

- 当前 Window 的浏览器 Back；
- `history.go(-1)`；
- 直接从外部文档进入后发生的第一次单步 Back；
- 异步 Handler、pending 去重和 LIFO 多层 Guard；
- active 缓冲刷新接管；
- 同源 iframe 内独立运行或显式传入其 Window；
- Chromium、Firefox 和 WebKit。

## 固定代价

首次注册通过 `history.pushState()` 增加一条同 URL 缓冲。History API 会因此截断当前已有的 Forward 栈。嵌套注册不会继续增加记录。

缓冲记录使用私有 `__revfanc_guard__` 字段。base 不写标记，业务 state 会随缓冲创建与释放保留。

## 不保证

- `history.go(-N)` 等多步穿越；
- 同一任务中已经排队的多次 Back；
- 地址栏输入、刷新动作本身和关闭标签页；
- 任意多步跨文档穿越；
- 父页面统一拦截所有子 iframe；
- 跨域 iframe；
- Guard 激活期间未经清理直接执行 `pushState`、`replaceState` 或路由导航。

主动导航前应执行：

```ts
await stop()
```

## iframe

浏览器会把顶层页面和子 iframe 的历史线性化到同一标签页导航序列。iframe 在父页面缓冲建立后新增记录时，下一次 Back 可能只穿越 iframe，父页面不会收到 `popstate`。

每个 Window 使用独立 Runtime。跨域 iframe 必须在自己的文档内安装本库。

## fail-open

多步穿越、URL 不匹配、保留字段冲突、外部 History 修改或写入失败时，库不主动抛出内部异常，也不会阻止未知导航。如果当前文档仍存活，Runtime 会尝试在新位置重新协调现存 Guard。
