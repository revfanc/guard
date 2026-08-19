import { createGuard } from "@revfanc/guard";

export function create(handler) {
  return createGuard(handler);
}
