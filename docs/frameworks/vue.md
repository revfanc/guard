# Vue

在组件或 composable 作用域中注册，并在作用域结束时触发停止：

```vue
<script setup lang="ts">
import { onScopeDispose } from "vue"
import { createGuard } from "@revfanc/guard"

const stop = createGuard(async (allow) => {
  if (await confirmLeaving()) allow()
})

onScopeDispose(() => {
  void stop()
})
</script>
```

一个 Window 同时只有一个 Handler。页面和 Dialog 都需要处理 Back 时，应在一个应用级 composable 中创建 Guard，再由 composable 分发当前业务回调。

主动调用路由器前必须显式 `await stop()`。如果组件受 `KeepAlive`缓存，还应在 `onActivated()`和 `onDeactivated()`之间更新当前业务 Handler。
