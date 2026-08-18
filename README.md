# @revfanc/guard

A small Vue Router POP navigation guard.

- Vue 3.5+
- Vue Router 4.5+ or 5
- Browser, hash, and memory history
- Back, Forward, and `go(N)`
- ESM and CommonJS, typed with TypeScript

```bash
pnpm add @revfanc/guard
```

Install the plugin once with the same Router instance used by the app:

```ts
import { createApp } from "vue"
import { createGuard } from "@revfanc/guard"
import { router } from "./router"
import App from "./App.vue"

const app = createApp(App)
const guard = createGuard(router)

app.use(router)
app.use(guard)
app.mount("#app")
```

Register a layer from a component or composable:

```ts
import { useGuard } from "@revfanc/guard"

const stop = useGuard(async (allow) => {
  if (await confirmLeaving()) {
    allow()
  }
})

// Optional. The current Vue scope also stops it automatically.
stop()
```

Only the top layer handles a POP. Calling `allow()` consumes that layer. If a
lower layer remains, Vue Router cancels the current POP; otherwise the original
POP completes. Settling without `allow()` rejects the POP and keeps the layer.

The package does not guard `push`, `replace`, reload, address-bar navigation, or
cross-document navigation. It does not write `history.state`.

`RouterHistory.listen()` is currently marked Alpha by Vue Router. The peer range
is intentionally limited to versions below 6 and the behavior is integration
tested against Vue Router 4.5.1 and 5.

## Development

```bash
pnpm install
pnpm check
pnpm test:e2e
pnpm pack:check
```

## License

MIT
