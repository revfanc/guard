import {
  createGuard,
  type Guard,
  type Handler,
} from "@revfanc/guard";
// @ts-expect-error useGuard was removed in v0.8.0.
import { useGuard } from "@revfanc/guard";

const handler: Handler = (allow) => {
  const result: void = allow();
  void result;
};
const guard: Guard = createGuard(handler);
const cleanup: Promise<void> = guard();
declare const frame: Window;
const frameGuard: Guard = createGuard(handler, frame);
declare const allow: Parameters<Handler>[0];

// @ts-expect-error createGuard requires a Handler.
createGuard({ handler });
// @ts-expect-error target must be a Window.
createGuard(handler, {});
// @ts-expect-error allow accepts no arguments.
allow(() => undefined);

void cleanup;
void frameGuard;
void useGuard;
