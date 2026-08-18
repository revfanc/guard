import { createGuard } from "@guard";

const attempts = document.querySelector<HTMLOutputElement>(
  '[data-testid="frame-attempts"]',
)!;
let allow: (() => void) | undefined;
let resolve: (() => void) | undefined;

if (new URLSearchParams(location.search).get("mode") === "self") {
  createGuard((current) => {
    attempts.textContent = String(Number(attempts.textContent) + 1);
    allow = current;
    return new Promise<void>((done) => {
      resolve = done;
    });
  });
}

document.querySelector('[data-testid="frame-deny"]')?.addEventListener(
  "click",
  () => {
    resolve?.();
    allow = undefined;
    resolve = undefined;
  },
);
document.querySelector('[data-testid="frame-allow"]')?.addEventListener(
  "click",
  () => {
    allow?.();
    resolve?.();
    allow = undefined;
    resolve = undefined;
  },
);
