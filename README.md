# @revfanc/guard

A small framework-independent guard for the browser Back button.

- No runtime dependencies
- One same-URL History buffer
- One active Handler per Window
- Asynchronous decisions and cleanup
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

// Await cleanup before programmatic navigation.
await stop()
```

`createGuard()` immediately creates or adopts one same-URL buffer. Browser Back
restores that buffer before invoking the Handler. Calling `allow()` releases the
buffer and continues the real Back; otherwise the page stays in place.

A Window has one active Handler. A later `createGuard()` replaces the previous
Handler without adding another History entry. The previous stop function resolves
immediately and cannot affect the replacement.

## Scope

The supported navigation is a single browser Back or `history.go(-1)`. Call and
await the returned Guard before `pushState`, `replaceState`, router navigation,
or document navigation. The stop function is idempotent and completes after the
buffer returns to the untagged page entry.

The active buffer can be adopted after reload without growing History. Ordinary
plain-object History state is preserved. Unsupported state, unknown traversal,
external History changes, and write failures fail open without library errors.

Forward, `history.go(-N)`, queued same-task Back calls, address-bar navigation,
reload itself, tab closing, iframe coordination, duplicate package runtimes, and
multiple Handler stacks are not guaranteed.

## Development

```bash
pnpm install
pnpm check
pnpm test:e2e
pnpm pack:check
```

## License

MIT
