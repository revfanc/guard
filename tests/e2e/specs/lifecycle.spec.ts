import { expect, test, type Page } from "@playwright/test";

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

  test("external sentinel replacement rejects disposal without losing state", async ({ page }) => {
    await page.getByTestId("replace-sentinel").dispatchEvent("click");
    await expect(page.getByTestId("decision")).toContainText("dispose:false");
    await expect(page.getByTestId("decision")).toContainText(
      "sentinel was replaced",
    );
    await expect
      .poll(() => page.evaluate(() => history.state))
      .toEqual({ screen: "external", nested: { kept: true } });
  });
});
