import {
  createBackGuard,
  type BackGuard,
  type BackHandler,
} from "@revfanc/guard";

const onBack: BackHandler = (allow) => {
  const accepted: boolean = allow();
  void accepted;
};
const guard: BackGuard = createBackGuard(onBack);
const disposal: Promise<void> = guard.dispose();
declare const allow: Parameters<BackHandler>[0];

// @ts-expect-error createBackGuard accepts a handler, not an options object.
createBackGuard({ onBack });
// @ts-expect-error allow accepts no arguments.
allow(() => undefined);
// @ts-expect-error the old unified method must not return.
guard.resolve();
// @ts-expect-error legacy lifecycle names must not return.
guard.done();

void disposal;
