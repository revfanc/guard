import guard = require("@revfanc/guard");

const handler: guard.Handler = (allow) => {
  const result: void = allow();
  void result;
};
const instance: guard.Guard = guard.createGuard(handler);
const cleanup: Promise<void> = instance();
declare const frame: Window;
const frameGuard: guard.Guard = guard.createGuard(handler, frame);
declare const allow: Parameters<guard.Handler>[0];

// @ts-expect-error useGuard was removed in v0.8.0.
guard.useGuard(handler);
// @ts-expect-error createGuard requires a Handler.
guard.createGuard({ handler });
// @ts-expect-error allow accepts no arguments.
allow(() => undefined);

void cleanup;
void frameGuard;
