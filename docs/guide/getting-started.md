# 快速开始

## 安装

```bash
pnpm add @revfanc/guard
```

包提供 ESM 与 CommonJS 入口，运行时代码兼容 ES2015，并且没有运行时依赖。

## 创建 guard

在受保护页面挂载后创建 guard：

```ts
import { createBackGuard } from "@revfanc/guard"

const guard = createBackGuard({
  async onBack({ stay, done }) {
    const confirmed = await confirmLeaving()

    if (!confirmed) {
      stay()
      return
    }

    done(() => history.back())
  },
  onError(error) {
    console.error("Back guard failed", error)
  },
})
```

创建时会增加一条同 URL 哨兵记录。用户单步返回后，库恢复保护并调用 `onBack`：

- `stay()`：留在页面，之后再次返回会产生新的 attempt。
- `done(action)`：完成这一层 guard；最后一层会先清理内部哨兵，再执行 `action`。

`done` 不替业务选择去向，因此返回上一条记录要明确传入 `() => history.back()`。

## 生命周期清理

```ts
onUnmounted(() => {
  guard.dispose()
})
```

`dispose()` 同步且幂等。它只注销 guard，不执行业务导航。主动跳转前也应先同步销毁：

```ts
guard.dispose()
router.push("/next")
```

框架接入只作为生命周期示例；库不保证 router POP 或 router 与原生 `popstate` 的监听顺序。详见[浏览器限制](./limitations)。
