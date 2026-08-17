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

const guard = createBackGuard(async (allow) => {
  if (await confirmLeaving()) {
    allow()
  }
})

// Await cleanup before an active navigation.
await guard.dispose()
await router.push("/next")
```

The library adds one same-URL sentinel entry. A single-step Back returns to the
protected entry, restores the sentinel, and calls the handler. Calling
`allow()` accepts that Back; when it is the final guard, the library
cleans its sentinel and continues the original Back automatically. If the
handler settles without calling `allow()`, the page stays protected and the
next Back creates a new attempt.

An asynchronous dialog must return its Promise. Repeated Back requests are
coalesced while that Promise is pending.

`guard.dispose()` resolves after cleanup. If another navigation has already
removed the owned history entry, disposal ends normally without rewriting the
new location or state. Real cleanup failures reject. Unhandled handler errors
and internal event failures still reach the browser's global error channel.

## Scope

Supported:

- native, same-document `history.back()` and `history.go(-1)` attempts;
- asynchronous decisions without duplicate handler calls;
- LIFO guards and disposal of any guard layer;
- one coordinated runtime across duplicate modules and hot reloads;
- current-protocol sentinel restoration after reload;
- queued teardown/recreation while sentinel cleanup is in progress.

Not guaranteed:

- Vue Router, React Router, or another router's POP behavior and listener order;
- blocking reload, tab close, address-bar, or cross-document navigation;
- long-press history selection, `history.go(-N)`, or queued rapid Back requests;
- forward navigation or external `pushState` / `replaceState` while active.

Use a router's own navigation guard or blocker when router POP must be covered.
See the [browser and state boundaries](https://revfanc.github.io/guard/guide/limitations).

## Development

```bash
pnpm install
pnpm check
pnpm test:e2e
pnpm pack:check
```

## License

MIT
