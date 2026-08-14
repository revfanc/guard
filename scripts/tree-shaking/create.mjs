import { createBackGuard } from "@revfanc/guard";

export function create(onBack) {
  return createBackGuard(onBack);
}
