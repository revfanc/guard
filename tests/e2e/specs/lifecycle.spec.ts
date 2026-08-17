import { expect, test, type Page } from "@playwright/test";
import { resolve } from "node:path";

const RUNTIME_PATH = resolve(
  import.meta.dirname,
  "../../../src/runtime.ts",
).replaceAll("\\", "/");

async function enterProtected(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByTestId("enter").click();
  await expect(page.getByTestId("page")).toHaveText("Protected");
}

async function requestBack(page: Page): Promise<void> {
  const popstates = page.getByTestId("popstates");
  const previous = Number(await popstates.textContent());
  await page.getByTestId("back").dispatchEvent("click");
  await expect(popstates).toHaveText(String(previous + 1));
}

test.describe("Guard lifecycle", () => {
  test.beforeEach(async ({ page }) => enterProtected(page));

  test("awaited disposal leaves the next Back pointed at origin", async ({ page }) => {
    const popstates = page.getByTestId("popstates");
    const previous = Number(await popstates.textContent());
    await page.getByTestId("dispose-guard").dispatchEvent("click");
    await expect(page.getByTestId("decision")).toHaveText("guard:disposed");
    await expect(popstates).toHaveText(String(previous + 1));
    await expect
      .poll(() => page.evaluate(() => history.state?.__revfanc_guard__))
      .toBeUndefined();

    await requestBack(page);
    await expect(page.getByTestId("page")).toHaveText("Origin");
    await expect(page).toHaveURL(/screen=origin/);
  });

  test("same-task dispose and recreate re-arms exactly one sentinel", async ({ page }) => {
    const length = await page.evaluate(() => history.length);

    await page.getByTestId("recreate-a").dispatchEvent("click");
    await expect(page.getByTestId("decision")).toHaveText("recreate:done");
    await expect
      .poll(() => page.evaluate(() => history.state?.__revfanc_guard__))
      .toEqual(expect.any(String));
    await expect.poll(() => page.evaluate(() => history.length)).toBe(length);

    await requestBack(page);
    await expect(page.getByTestId("a-attempts")).toHaveText("1");
    await expect(page.getByTestId("page")).toHaveText("Protected");
  });

  test("independently evaluated modules share the window runtime", async ({ page }) => {
    await page.evaluate(async (runtimePath) => {
      const firstUrl = `/@fs/${runtimePath}?first-${crypto.randomUUID()}`;
      const secondUrl = `/@fs/${runtimePath}?second-${crypto.randomUUID()}`;
      const first = await import(/* @vite-ignore */ firstUrl) as typeof import("../../../src/runtime");
      const second = await import(/* @vite-ignore */ secondUrl) as typeof import("../../../src/runtime");
      const scope = window as Window & {
        duplicate?: {
          calls: [number, number];
          first: ReturnType<typeof first.createGuard>;
          second: ReturnType<typeof second.createGuard>;
        };
      };
      const calls: [number, number] = [0, 0];
      scope.duplicate = {
        calls,
        first: first.createGuard(window, () => {
          calls[0] += 1;
        }),
        second: second.createGuard(window, () => {
          calls[1] += 1;
        }),
      };
    }, RUNTIME_PATH);

    await page.evaluate(() => history.back());
    await expect
      .poll(() => page.evaluate(() => (
        window as Window & { duplicate?: { calls: [number, number] } }
      ).duplicate?.calls))
      .toEqual([0, 1]);

    await page.evaluate(async () => {
      const scope = window as Window & {
        duplicate?: { second: { dispose(): Promise<void> } };
      };
      await scope.duplicate?.second.dispose();
    });
    await page.evaluate(() => history.back());
    await expect
      .poll(() => page.evaluate(() => (
        window as Window & { duplicate?: { calls: [number, number] } }
      ).duplicate?.calls))
      .toEqual([1, 1]);

    await page.evaluate(async () => {
      const scope = window as Window & {
        duplicate?: { first: { dispose(): Promise<void> } };
      };
      await scope.duplicate?.first.dispose();
    });
  });

  test("reload restores the current protocol without growing history", async ({ page }) => {
    const length = await page.evaluate(() => history.length);
    const marker = await page.evaluate(
      () => history.state?.__revfanc_guard__,
    );

    for (let count = 0; count < 3; count += 1) {
      await page.reload();
      await expect(page.getByTestId("page")).toHaveText("Protected");
      await expect.poll(() => page.evaluate(() => history.length)).toBe(length);
      await expect
        .poll(() => page.evaluate(() => history.state?.__revfanc_guard__))
        .toBe(marker);
    }

    await requestBack(page);
    await expect(page.getByTestId("a-attempts")).toHaveText("1");
    await page.getByTestId("allow-attempt").dispatchEvent("click");
    await expect(page.getByTestId("page")).toHaveText("Origin");
    await expect(page).toHaveURL(/screen=origin/);
  });

  test("final disposal writes the latest sentinel state back to base", async ({ page }) => {
    await page.evaluate(() => {
      history.replaceState(
        { ...history.state, latest: { kept: true } },
        "",
        location.href,
      );
    });

    await page.getByTestId("dispose-guard").dispatchEvent("click");
    await expect(page.getByTestId("decision")).toHaveText("guard:disposed");
    await expect
      .poll(() => page.evaluate(() => history.state))
      .toEqual({ screen: "protected", latest: { kept: true } });
  });

  test("100 dispose and recreate cycles do not grow history", async ({
    page,
    browserName,
  }) => {
    test.setTimeout(180_000);

    if (browserName === "webkit") {
      await page.getByTestId("cycle-a").evaluate((button) => {
        button.dataset.delay = "700";
      });
    }

    await page.getByTestId("cycle-a").dispatchEvent("click");
    await expect(page.getByTestId("cycles")).toHaveText("100", {
      timeout: 150_000,
    });
    await expect(page.getByTestId("decision")).toHaveText("cycles:done");
    const lengths = (await page.getByTestId("cycle-length").textContent())?.split(":");
    expect(lengths?.[0]).toBe(lengths?.[1]);

    await requestBack(page);
    await expect(page.getByTestId("a-attempts")).toHaveText("1");
    await expect(page.getByTestId("page")).toHaveText("Protected");
  });

  test("external sentinel replacement ends the guard without losing state", async ({ page }) => {
    await page.getByTestId("replace-sentinel").dispatchEvent("click");
    await expect(page.getByTestId("decision")).toHaveText(
      "dispose:done",
    );
    await expect
      .poll(() => page.evaluate(() => history.state))
      .toEqual({ screen: "external", nested: { kept: true } });
  });
});
