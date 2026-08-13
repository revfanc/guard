import guard = require("@revfanc/guard");

function stay(attempt: guard.BackAttempt): boolean {
  return attempt.stay();
}

function done(attempt: guard.BackAttempt): boolean {
  return attempt.done(() => undefined);
}

const instance: guard.BackGuard = guard.createBackGuard({
  onBack(attempt: guard.BackAttempt) {
    stay(attempt);
  },
});

const supported: boolean = guard.isBackGuardSupported();
const disposed: void = instance.dispose();

void supported;
void disposed;
void done;
