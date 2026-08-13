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

// Component cleanup is synchronous.
guard.dispose()
```

The library adds one same-URL sentinel entry. A single-step back returns to the
protected entry, restores the sentinel, and calls `onBack` once. `stay()` arms
the guard for a later attempt. `done(action)` completes the current guard; when
it is the last guard, `action` runs only after the internal sentinel traversal
has completed. The library does not choose the final navigation for you.

## Scope

Supported:

- native, same-document `history.back()` and `history.go(-1)` attempts;
- asynchronous decisions without duplicate `onBack` calls;
- LIFO guards, with a paused attempt resuming after the guard above it is disposed;
- synchronous, idempotent disposal.

Not guaranteed:

- router POP behavior or listener ordering in Vue Router, React Router, or other routers;
- reload, tab close, address-bar and cross-document navigation;
- long-press history selection, `history.go(-N)`, or queued rapid back requests;
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
