import {
  createGuard,
  useGuard,
  type Guard,
  type Handler,
} from "@revfanc/guard";
import type { Plugin } from "vue";
import type { Router } from "vue-router";

declare const router: Router;
const guard: Guard = createGuard(router);
const plugin: Plugin = guard;
const handler: Handler = (allow) => {
  const result: void = allow();
  void result;
};
const stop: () => void = useGuard(handler);

// @ts-expect-error createGuard accepts a Router, not a Handler.
createGuard(handler);
// @ts-expect-error useGuard accepts a Handler, not an options object.
useGuard({ handler });

void plugin;
void stop;
