# @revfanc/guard

A small framework-independent guard for the browser Back button.

- No runtime dependencies
- Vanilla JavaScript, React, Vue, Svelte, and other browser frameworks
- One same-URL History buffer for the first single-step Back
- LIFO registrations and asynchronous decisions
- ESM, CommonJS, and TypeScript declarations

```bash
pnpm add @revfanc/guard
```

```ts
import { createGuard } from "@revfanc/guard"

const stop = createGuard(async (allow) => {
  if (await confirmLeaving()) {
    allow()
  }
})

// Await cleanup before a programmatic navigation.
await stop()
```

`createGuard()` immediately registers one layer and returns an idempotent
asynchronous stop function. Browser Back only invokes the most recently
registered Handler. Calling `allow()` consumes that layer; the real Back is
performed only after the final layer allows.

The first registration pushes one same-URL buffer entry. Nested registrations
share it. Creating that entry truncates an existing Forward stack, as required
by the History API.

An optional same-origin `Window` can be guarded explicitly:

```ts
const stopFrame = createGuard(handler, iframe.contentWindow!)
```

Each Window owns an isolated Runtime. A cross-origin iframe must install the
library within its own document.

## Scope

The supported navigation is a single browser Back or `history.go(-1)`.
`history.go(-N)`, queued same-task Back calls, address-bar navigation, reload,
tab closing, and descendant iframe history changes are not guaranteed.

Call and await the returned Guard before `pushState`, `replaceState`, router
navigation, or document navigation. Unknown History changes fail open instead
of throwing library errors. Handler errors are reported through
`window.reportError()`.

## Development

```bash
pnpm install
pnpm check
pnpm test:e2e
pnpm pack:check
```

## License

MIT
