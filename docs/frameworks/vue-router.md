# Vue Router

在受保护路由组件挂载后创建 guard，并在卸载前销毁。VitePress 和 Vue SSR 构建期间没有 `window`，因此不要在模块顶层创建。

```vue
<script setup lang="ts">
import { onMounted, onUnmounted } from "vue"
import { createBackGuard, type BackGuard } from "@revfanc/guard"

let guard: BackGuard | undefined

onMounted(() => {
  guard = createBackGuard({
    onBack({ leave, reset }) {
      openLeaveDialog({ confirm: leave, cancel: reset })
    },
  })
})

onUnmounted(() => {
  guard?.dispose()
})
</script>
```

Browser history 与 hash history 均可使用。Guard 会保留 Vue Router 写入 `history.state` 的字段。通过按钮主动调用 `router.push()` 离开前，也应先执行 `guard.dispose()`。
