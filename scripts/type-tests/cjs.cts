import guard = require("@revfanc/guard");

const onBack: guard.BackHandler = (allow) => {
  const accepted: boolean = allow();
  void accepted;
};
const instance: guard.BackGuard = guard.createBackGuard(onBack);
const disposal: Promise<void> = instance.dispose();
declare const allow: Parameters<guard.BackHandler>[0];

// @ts-expect-error createBackGuard accepts a handler, not an options object.
guard.createBackGuard({ onBack });
// @ts-expect-error allow accepts no arguments.
allow(() => undefined);
// @ts-expect-error the old unified method must not return.
instance.resolve();
// @ts-expect-error legacy lifecycle names must not return.
instance.done();

void disposal;
