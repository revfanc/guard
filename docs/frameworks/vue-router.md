# Vue 生命周期示例

这是组件生命周期示例，不是 Vue Router POP 兼容承诺。需要拦截应用内路由跳转时，请使用 Vue Router 导航守卫。

```vue
<script setup lang="ts">
import { onMounted, onUnmounted, shallowRef } from "vue"
import { createBackGuard, type BackGuard } from "@revfanc/guard"

const guard = shallowRef<BackGuard>()

onMounted(() => {
  guard.value = createBackGuard(async (attempt) => {
    if (await confirmLeaving()) {
      attempt.allow()
    }
  })
})

onUnmounted(() => {
  const current = guard.value
  guard.value = undefined
  void current?.dispose().catch(reportError)
})
</script>
```

异步确认必须由 handler 返回。未调用 `allow()` 就完成 handler，表示拒绝本次 Back 并重新布防。

主动 router 导航应等待本库清理：

```ts
async function goNext() {
  const current = guard.value
  guard.value = undefined

  if (current) await current.dispose()
  await router.push("/next")
}
```

这只协调本库 sentinel 与主动 push。库不保证 Vue Router POP、导航守卫顺序或 router 与原生 `popstate` 监听器的先后。创建 Guard 前还需确认当前 `history.state` 满足[严格输入契约](../guide/limitations#historystate-契约)。
