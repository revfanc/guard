import {
  createBackGuard,
  type BackAction,
  type BackAttempt,
  type BackGuard,
  type BackGuardOptions,
  type BackResolution,
} from "@revfanc/guard";

const action: BackAction = () => Promise.resolve("navigated");
function checkAttempt(attempt: BackAttempt): void {
  const results: boolean[] = [attempt.resolve(), attempt.resolve(action)];
  void results;
}
const options: BackGuardOptions = { onBack: checkAttempt };
const resolution: BackResolution = createBackGuard(options);
const guard: BackGuard = resolution;
const results: boolean[] = [resolution.resolve(), guard.resolve(action)];

// @ts-expect-error resolve(undefined) must not become silent resolution.
resolution.resolve(undefined);
// @ts-expect-error legacy methods must not return to the public contract.
resolution.stay();
// @ts-expect-error legacy methods must not return to the public contract.
resolution.done();
// @ts-expect-error lifecycle cleanup is expressed by resolve().
guard.dispose();

void results;
