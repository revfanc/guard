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

test.describe("framework-independent Guard", () => {
  test("denies and then allows the first single-step Back", async ({ page }) => {
    await protectedPage(page);

    await back(page);
    await expect(page.getByTestId("a-attempts")).toHaveText("1");
    await page.getByTestId("deny-a").click();
    await expect(page).toHaveURL(/screen=protected/);
    await expect(page.getByTestId("page")).toHaveText("Protected");

    await back(page);
    await expect(page.getByTestId("a-attempts")).toHaveText("2");
    await page.getByTestId("allow-a").click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("page")).toHaveText("Origin");
  });

  test("consumes nested registrations in LIFO order", async ({ page }) => {
    await protectedPage(page);
    await page.getByTestId("add-b").click();

    await back(page);
    await expect(page.getByTestId("b-attempts")).toHaveText("1");
    await expect(page.getByTestId("a-attempts")).toHaveText("0");
    await page.getByTestId("allow-b").click();
    await expect(page).toHaveURL(/screen=protected/);

    await back(page);
    await expect(page.getByTestId("a-attempts")).toHaveText("1");
    await page.getByTestId("allow-a").click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("does not duplicate a pending Handler", async ({ page }) => {
    await protectedPage(page);
    await back(page);
    await expect(page.getByTestId("a-attempts")).toHaveText("1");
    await expect
      .poll(() => page.evaluate(() => history.state?.__revfanc_guard__))
      .toMatch(/^a:/);

    await back(page);
    await expect(page.getByTestId("a-attempts")).toHaveText("1");
    await page.getByTestId("deny-a").click();
    await expect(page).toHaveURL(/screen=protected/);
  });

  test("stops asynchronously and rejects inactive Forward", async ({ page }) => {
    await protectedPage(page);
    await page.getByTestId("stop-a").click();
    await expect(page.getByTestId("decision")).toHaveText("a:stopped");
    await expect
      .poll(() => page.evaluate(() => history.state?.__revfanc_guard__))
      .toBeUndefined();

    const current = Number(await page.getByTestId("popstates").textContent());
    await page.evaluate(() => history.forward());
    await expect
      .poll(async () => Number(await page.getByTestId("popstates").textContent()))
      .toBeGreaterThan(current);
    await expect(page).toHaveURL(/screen=protected/);
    await expect
      .poll(() => page.evaluate(() => history.state?.__revfanc_guard__))
      .toBeUndefined();
  });

  test("fails open for go(-2) without calling the Handler", async ({ page }) => {
    await protectedPage(page);

    await page.getByTestId("minus-two").click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("page")).toHaveText("Origin");
    await expect(page.getByTestId("a-attempts")).toHaveText("0");
    await expect
      .poll(() => page.evaluate(() => history.state?.__revfanc_guard__))
      .toMatch(/^a:/);
  });

  test("adopts an active buffer across reload without growing history", async ({ page }) => {
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

  test("runs independently inside an iframe", async ({ page }) => {
    await page.goto("/?screen=iframe-self");
    const frame = page.frameLocator('[data-testid="frame"]');
    await expect(frame.getByTestId("frame-page")).toHaveText("Frame");

    await page.evaluate(() => history.back());

    await expect(frame.getByTestId("frame-attempts")).toHaveText("1");
    await frame.getByTestId("frame-deny").click();
    await expect(page.getByTestId("page")).toHaveText("iframe-self");
  });

  test("can target a same-origin iframe explicitly", async ({ page }) => {
    await page.goto("/?screen=iframe-target");
    const frame = page.frameLocator('[data-testid="frame"]');
    await expect(frame.getByTestId("frame-page")).toHaveText("Frame");
    await expect(page.getByTestId("decision")).toHaveText("a:added");

    await page.evaluate(() => history.back());

    await expect(page.getByTestId("a-attempts")).toHaveText("1");
    await expect(frame.getByTestId("frame-attempts")).toHaveText("0");
    await page.getByTestId("deny-a").dispatchEvent("click");
  });
});
