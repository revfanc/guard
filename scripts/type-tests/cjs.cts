import guard = require("@revfanc/guard");
type Plugin = import(
  "vue",
  { with: { "resolution-mode": "import" } }
).Plugin;
type Router = import(
  "vue-router",
  { with: { "resolution-mode": "import" } }
).Router;

declare const router: Router;
const instance: guard.Guard = guard.createGuard(router);
const plugin: Plugin = instance;
const handler: guard.Handler = (allow) => {
  const result: void = allow();
  void result;
};
const stop: () => void = guard.useGuard(handler);
declare const allow: Parameters<guard.Handler>[0];

// @ts-expect-error createGuard accepts a Router, not a Handler.
guard.createGuard(handler);
// @ts-expect-error allow accepts no arguments.
allow(() => undefined);

void plugin;
void stop;
