import { createGuard } from "@revfanc/guard";

export function create(handler, target) {
  return createGuard(handler, target);
}
