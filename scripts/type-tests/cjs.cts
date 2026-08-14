import guard = require("@revfanc/guard");

const onBack: guard.BackHandler = (attempt: guard.BackAttempt) => {
  const accepted: boolean = attempt.allow();
  void accepted;
};
const instance: guard.BackGuard = guard.createBackGuard(onBack);
const disposal: Promise<void> = instance.dispose();
declare const attempt: guard.BackAttempt;

// @ts-expect-error createBackGuard accepts a handler, not an options object.
guard.createBackGuard({ onBack });
// @ts-expect-error allow never accepts a navigation callback.
attempt.allow(() => undefined);
// @ts-expect-error the old unified method must not return.
instance.resolve();
// @ts-expect-error legacy lifecycle names must not return.
instance.done();

void disposal;
