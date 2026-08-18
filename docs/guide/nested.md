# 多层 Guard

多个 Guard 按注册顺序组成 LIFO 栈。一次 POP 只处理一层，不会在同一次导航里连续调用多个 Handler。

例如页面表单上方又打开确认框：

```ts
// 页面层先注册
useGuard(async (allow) => {
  if (await confirmLeavingForm()) allow()
})

// 对话框层后注册
useGuard((allow) => {
  closeDialog()
  allow()
})
```

首次 Back 调用对话框层。它调用 `allow()` 后被消费，但因为还有页面层，当前 POP 被 Vue Router 拒绝，地址保持不变。再次 Back 才调用页面层。

主动关闭某一层时，调用对应的停止函数即可；停止非栈顶层不会影响其他层。
