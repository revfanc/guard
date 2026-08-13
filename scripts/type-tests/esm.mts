import {
  createBackGuard,
  isBackGuardSupported,
  type BackAttempt,
  type BackGuard,
} from "@revfanc/guard";

function stay(attempt: BackAttempt): boolean {
  return attempt.stay();
}

function done(attempt: BackAttempt): boolean {
  return attempt.done(() => undefined);
}

const guard: BackGuard = createBackGuard({
  onBack(attempt: BackAttempt) {
    stay(attempt);
  },
});

const supported: boolean = isBackGuardSupported();
const disposed: void = guard.dispose();

void supported;
void disposed;
void done;
