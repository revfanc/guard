import { createBackGuard } from "@revfanc/guard";

export function create(onDone) {
  const guard = createBackGuard({
    onBack(attempt) {
      if (onDone) {
        attempt.done(onDone);
        return;
      }

      attempt.stay();
    },
  });

  guard.dispose();
}
