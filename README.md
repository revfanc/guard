# @revfanc/guard

A small, framework-agnostic browser back guard built on the History API.

```bash
pnpm add @revfanc/guard
```

```ts
import { createBackGuard } from "@revfanc/guard";

const guard = createBackGuard({
  onBack({ leave, reset }) {
    showConfirmDialog({
      confirm: leave,
      cancel: reset,
    });
  },
});

// Dispose before navigating forward or unmounting the protected page.
guard.dispose();
```

`@revfanc/guard` adds one same-URL sentinel entry and restores it when a
single-step back traversal is attempted. It does not disable browser
navigation and cannot cover tab closing, reloads, address-bar navigation,
cross-document jumps, long-press history selection, or `history.go(-N)`.

See the full documentation at <https://revfanc.github.io/guard/>.

## Development

```bash
pnpm install
pnpm check
pnpm test:e2e
pnpm docs:dev
```

## License

MIT
