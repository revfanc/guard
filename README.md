# @revfanc/guard

A small browser-back guard for the native History API.

- ES2015-compatible runtime
- ESM and CommonJS exports
- Tree-shakeable, with no runtime dependencies
- Typed with TypeScript

```bash
pnpm add @revfanc/guard
```

```ts
import { createBackGuard } from "@revfanc/guard"

const guard = createBackGuard({
  async onBack(attempt) {
    const confirmed = await confirmLeaving()

    if (!confirmed) {
      attempt.resolve()
      return
    }

    attempt.resolve(() => history.back())
  },
  onError(error) {
    console.error("Back guard failed", error)
  },
})

// Resolve this guard without a navigation action during component cleanup.
guard.resolve()
```

If `onError` is omitted, reported failures may reach the browser's global
`error` or `unhandledrejection` channel.

The library adds one same-URL sentinel entry. A single-step back returns to the
protected entry, restores the sentinel, and calls `onBack` once. Attempts and
guards share one verb: `resolve()`. Without an action it settles silently;
with an action it commits the guard and runs that action when it is safe. For an
attempt, silent resolution means staying and arming the same guard again. For a
guard, it means ending that guard's lifecycle.

Both overloads return whether the transition was accepted. The first accepted
resolution wins; later calls return `false`, and an action is never run more
than once. A final actionful resolution first returns from the sentinel to the
protected base entry, then runs the action. The library does not choose the
final navigation for you:

```ts
guard.resolve(() => router.push("/next"))
```

## Scope

Supported:

- native, same-document `history.back()` and `history.go(-1)` attempts;
- asynchronous decisions without duplicate `onBack` calls;
- LIFO guards, with a paused attempt resuming after the guard above it resolves;
- silent resolution of any guard layer, and actionful resolution of the top layer;
- queued teardown/recreation while a silent sentinel cleanup is in progress; the replacement becomes active only after the cleanup reaches its base.

Not guaranteed:

- router POP behavior or listener ordering in Vue Router, React Router, or other routers;
- reload, tab close, address-bar and cross-document navigation;
- long-press history selection, `history.go(-N)`, or queued rapid back requests, including the not-yet-active recreate window;
- forward navigation or external `pushState` / `replaceState` while a guard is active.

See the [browser and state boundaries](https://revfanc.github.io/guard/guide/limitations).

## Tooling and layout

The package uses [tsdown](https://tsdown.dev/) for ESM, CommonJS, declarations,
and source maps. Vite serves the vanilla browser fixture, Vitest covers the
state machine, and Playwright verifies Chromium, Firefox, and WebKit.

```text
src/                  Library source
tests/unit/           Deterministic state-machine tests
tests/e2e/            Vanilla three-browser behavior tests
docs/                 VitePress documentation
tsdown.config.ts      ESM/CJS library build
tsconfig.build.json   ES2015 build boundary
```

## Development

```bash
pnpm install
pnpm check
pnpm test:e2e
pnpm pack:check
```

## License

MIT
