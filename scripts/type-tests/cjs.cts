import guard = require("@revfanc/guard");

const handler: guard.Handler = (allow) => {
  const result: void = allow();
  void result;
};
const instance: guard.Guard = guard.createGuard(handler);
const cleanup: Promise<void> = instance();
declare const frame: Window;
declare const allow: Parameters<guard.Handler>[0];

// @ts-expect-error useGuard is not public.
guard.useGuard(handler);
// @ts-expect-error createGuard requires a Handler.
guard.createGuard({ handler });
// @ts-expect-error createGuard only accepts a Handler.
guard.createGuard(handler, frame);
// @ts-expect-error allow accepts no arguments.
allow(() => undefined);

void cleanup;
