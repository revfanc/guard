import guard = require("@revfanc/guard");

const action: guard.BackAction = () => Promise.resolve("navigated");
function checkAttempt(attempt: guard.BackAttempt): void {
  const results: boolean[] = [attempt.resolve(), attempt.resolve(action)];
  void results;
}
const options: guard.BackGuardOptions = { onBack: checkAttempt };
const resolution: guard.BackResolution = guard.createBackGuard(options);
const instance: guard.BackGuard = resolution;
const results: boolean[] = [resolution.resolve(), instance.resolve(action)];

// @ts-expect-error resolve(undefined) must not become silent resolution.
resolution.resolve(undefined);
// @ts-expect-error legacy methods must not return to the public contract.
resolution.stay();
// @ts-expect-error legacy methods must not return to the public contract.
resolution.done();
// @ts-expect-error lifecycle cleanup is expressed by resolve().
instance.dispose();

void results;
