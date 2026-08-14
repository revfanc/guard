# Vue 生命周期示例

这是静态生命周期示例，不是 Vue Router POP 兼容承诺。库不保证 router 与原生 `popstate` 的监听顺序；需要覆盖应用内路由跳转时，应使用 Vue Router 导航守卫。

```vue
<script setup lang="ts">
import { onMounted, onUnmounted, shallowRef } from "vue"
import { createBackGuard, type BackGuard } from "@revfanc/guard"

const guard = shallowRef<BackGuard>()

onMounted(() => {
  guard.value = createBackGuard({
    async onBack(attempt) {
      if (await confirmLeaving()) {
        attempt.resolve(() => history.back())
        return
      }

      attempt.resolve()
    },
  })
})

onUnmounted(() => {
  guard.value?.resolve()
  guard.value = undefined
})
</script>
```

组件卸载使用无 action 的 `resolve()`。最后一层的静默 cleanup 尚未完成时，Strict Mode 式快速重建或新的 `createBackGuard()` 会排队。

主动 router 导航则把 push 放进 actionful overload，不能先静默 resolve 再单独 push：

```ts
function goNext() {
  const current = guard.value

  if (!current) {
    void router.push("/next")
    return
  }

  current.resolve(() => {
    if (guard.value === current) {
      guard.value = undefined
    }
    return router.push("/next")
  })
}
```

Actionful resolve 只允许栈顶 guard。返回 `false` 时 router action 不会执行。

这个模式只协调本库 sentinel 与主动 push。它不保证 Vue Router POP、导航守卫顺序或 router 与原生 `popstate` 监听器的先后。创建 guard 前请确认当前 `history.state` 满足[严格输入契约](../guide/limitations#history-state-契约)。
