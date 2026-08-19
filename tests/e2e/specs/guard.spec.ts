import { expect, test, type Page } from "@playwright/test";

async function protectedPage(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByTestId("enter").click();
  await expect(page.getByTestId("page")).toHaveText("Protected");
  await expect
    .poll(() => page.evaluate(() => history.state?.__revfanc_guard__))
    .toMatch(/^a:/);
}

async function back(page: Page): Promise<void> {
  const current = Number(await page.getByTestId("popstates").textContent());
  await page.evaluate(() => history.back());
  await expect(page.getByTestId("popstates")).toHaveText(String(current + 1));
}

test.describe("single Guard", () => {
  test("denies and then allows the first Back", async ({ page }) => {
    await protectedPage(page);

    await back(page);
    await expect(page.getByTestId("a-attempts")).toHaveText("1");
    await page.getByTestId("deny-a").click();
    await expect(page).toHaveURL(/screen=protected/);

    await back(page);
    await expect(page.getByTestId("a-attempts")).toHaveText("2");
    await page.getByTestId("allow-a").click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("page")).toHaveText("Origin");
  });

  test("replaces the Handler without growing history", async ({ page }) => {
    await protectedPage(page);
    const length = await page.evaluate(() => history.length);

    await page.getByTestId("add-b").click();
    await expect.poll(() => page.evaluate(() => history.length)).toBe(length);
    await page.getByTestId("stop-a").click();
    await expect(page.getByTestId("decision")).toHaveText("a:stopped");

    await back(page);
    await expect(page.getByTestId("a-attempts")).toHaveText("0");
    await expect(page.getByTestId("b-attempts")).toHaveText("1");
    await page.getByTestId("deny-b").click();
  });

  test("does not duplicate a pending Handler", async ({ page }) => {
    await protectedPage(page);
    await back(page);
    await expect(page.getByTestId("a-attempts")).toHaveText("1");

    await back(page);
    await expect(page.getByTestId("a-attempts")).toHaveText("1");
    await page.getByTestId("deny-a").click();
    await expect(page).toHaveURL(/screen=protected/);
  });

  test("stops asynchronously at the page entry", async ({ page }) => {
    await protectedPage(page);
    await page.getByTestId("stop-a").click();
    await expect(page.getByTestId("decision")).toHaveText("a:stopped");
    await expect
      .poll(() => page.evaluate(() => history.state?.__revfanc_guard__))
      .toBeUndefined();

    await page.evaluate(() => history.back());
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("page")).toHaveText("Origin");
  });

  test("fails open for go(-2)", async ({ page }) => {
    await protectedPage(page);

    await page.getByTestId("minus-two").click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("page")).toHaveText("Origin");
    await expect(page.getByTestId("a-attempts")).toHaveText("0");
  });

  test("adopts the buffer across reload", async ({ page }) => {
    await protectedPage(page);
    const length = await page.evaluate(() => history.length);
    const marker = await page.evaluate(
      () => history.state?.__revfanc_guard__ as string,
    );

    for (let count = 0; count < 3; count += 1) {
      await page.reload();
      await expect(page.getByTestId("page")).toHaveText("Protected");
      await expect.poll(() => page.evaluate(() => history.length)).toBe(length);
      await expect
        .poll(() => page.evaluate(() => history.state?.__revfanc_guard__))
        .toBe(marker);
    }

    await back(page);
    await expect(page.getByTestId("a-attempts")).toHaveText("1");
  });

  test("guards direct entry from an external document", async ({ page }) => {
    await page.goto("/outside.html");
    await page.getByTestId("open-protected").click();
    await expect(page.getByTestId("page")).toHaveText("Protected");

    await back(page);
    await expect(page.getByTestId("a-attempts")).toHaveText("1");
    await page.getByTestId("deny-a").click();
    await expect(page.getByTestId("page")).toHaveText("Protected");

    await back(page);
    await expect(page.getByTestId("a-attempts")).toHaveText("2");
    await page.getByTestId("allow-a").click();
    await expect(page.getByTestId("outside")).toHaveText("Outside");
    await expect(page).toHaveURL(/outside\.html$/);
  });
});
