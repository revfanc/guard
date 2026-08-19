import {
  createGuard,
  type Guard,
  type Handler,
} from "@revfanc/guard";
// @ts-expect-error useGuard is not public.
import { useGuard } from "@revfanc/guard";

const handler: Handler = (allow) => {
  const result: void = allow();
  void result;
};
const guard: Guard = createGuard(handler);
const cleanup: Promise<void> = guard();
declare const frame: Window;
declare const allow: Parameters<Handler>[0];

// @ts-expect-error createGuard requires a Handler.
createGuard({ handler });
// @ts-expect-error createGuard only accepts a Handler.
createGuard(handler, frame);
// @ts-expect-error allow accepts no arguments.
allow(() => undefined);

void cleanup;
void useGuard;
