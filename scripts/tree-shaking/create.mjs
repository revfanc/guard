import { createGuard } from "@revfanc/guard";

export function create(router) {
  return createGuard(router);
}
