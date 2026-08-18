# 多层 Guard

多个 `createGuard()` 注册组成 LIFO 栈。一次 Back 只处理一层。

```ts
const stopPage = createGuard(async (allow) => {
  if (await confirmLeavingForm()) allow()
})

const stopDialog = createGuard((allow) => {
  closeDialog()
  allow()
})
```

第一次 Back 只调用对话框层。对话框调用 `allow()` 后被消费，但页面层仍存在，因此地址不变。第二次 Back 才调用页面层。

主动关闭某一层时调用对应 Guard：

```ts
await stopDialog()
```

停止非最后一层只移除该注册，不释放共享缓冲。pending 决策期间新增的 Guard 不会接管当前 Attempt，从下一次 Back 开始生效。
