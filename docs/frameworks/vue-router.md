# Vue 生命周期示例

这是静态生命周期示例，不是 Vue Router POP 兼容承诺。库不保证 router 与原生 `popstate` 的监听顺序；需要覆盖应用内路由跳转时，应使用 Vue Router 导航守卫。

```vue
<script setup lang="ts">
import { onMounted, onUnmounted, shallowRef } from "vue"
import { createBackGuard, type BackGuard } from "@revfanc/guard"

const guard = shallowRef<BackGuard>()

onMounted(() => {
  guard.value = createBackGuard({
    async onBack({ stay, done }) {
      if (await confirmLeaving()) {
        done(() => history.back())
        return
      }

      stay()
    },
  })
})

onUnmounted(() => {
  guard.value?.dispose()
  guard.value = undefined
})
</script>
```

主动 router 导航前同步注销 guard：

```ts
function goNext() {
  guard.value?.dispose()
  void router.push("/next")
}
```

创建 guard 前请确认当前 `history.state` 满足[严格输入契约](../guide/limitations#history-state-契约)。
