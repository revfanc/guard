import {
  createBackGuard,
  type BackAttempt,
  type BackGuard,
  type BackHandler,
} from "@revfanc/guard";

const onBack: BackHandler = (attempt: BackAttempt) => {
  const accepted: boolean = attempt.allow();
  void accepted;
};
const guard: BackGuard = createBackGuard(onBack);
const disposal: Promise<void> = guard.dispose();
declare const attempt: BackAttempt;

// @ts-expect-error createBackGuard accepts a handler, not an options object.
createBackGuard({ onBack });
// @ts-expect-error allow never accepts a navigation callback.
attempt.allow(() => undefined);
// @ts-expect-error the old unified method must not return.
guard.resolve();
// @ts-expect-error legacy lifecycle names must not return.
guard.done();

void disposal;
