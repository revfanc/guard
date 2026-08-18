# Vue

在组件作用域中注册，并用 `onScopeDispose()` 触发停止：

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

Vue 只负责生命周期绑定，本包不依赖 Vue 或 Vue Router。主动调用路由器前应显式 `await stop()`。
