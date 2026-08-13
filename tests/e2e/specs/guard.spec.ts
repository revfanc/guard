import { expect, test } from "@playwright/test";

async function enterProtected(page: import("@playwright/test").Page, fixture: string) {
  await page.goto(`/?fixture=${fixture}`);
  await page.getByTestId("enter").click();
  await expect(page.getByTestId("page")).toHaveText("Protected");
}

test.describe("vanilla history guard", () => {
  test("blocks browser and programmatic back until leave", async ({ page }) => {
    await enterProtected(page, "vanilla");
    const protectedUrl = page.url();

    await page.goBack();
    await expect(page.getByTestId("attempts")).toHaveText("1");
    await expect(page).toHaveURL(protectedUrl);

    await page.getByTestId("back").click({ noWaitAfter: true });
    await expect(page.getByTestId("attempts")).toHaveText("1");
    await expect(page).toHaveURL(protectedUrl);

    await page.getByTestId("reset").click();
    await page.getByTestId("back").click({ noWaitAfter: true });
    await expect(page.getByTestId("attempts")).toHaveText("2");
    await page.getByTestId("leave").click({ noWaitAfter: true });
    await expect(page.getByTestId("page")).toHaveText("Origin", { timeout: 15_000 });
  });

  test("shares one sentinel and cascades nested guards", async ({ page }) => {
    await enterProtected(page, "vanilla");
    const sentinelLength = await page.getByTestId("history-length").textContent();
    await page.getByTestId("add-guard").click();
    await expect(page.getByTestId("history-length")).toHaveText(sentinelLength ?? "");

    await page.goBack();
    await expect(page.getByTestId("attempts")).toHaveText("1");
    await page.getByTestId("leave").click({ noWaitAfter: true });
    await expect(page.getByTestId("attempts")).toHaveText("2");
    await page.getByTestId("leave").click({ noWaitAfter: true });
    await expect(page.getByTestId("page")).toHaveText("Origin", { timeout: 15_000 });
  });
});

for (const fixture of ["vue-browser", "vue-hash", "react-browser", "react-hash"]) {
  test(`${fixture} keeps router state stable and allows one real POP`, async ({ page }) => {
    await enterProtected(page, fixture);
    const protectedUrl = page.url();
    await expect(page.getByTestId("route-changes")).toHaveText(/^[1-9]\d*$/);
    const routeChanges = await page.getByTestId("route-changes").textContent();

    await page.goBack();
    await expect(page.getByTestId("attempts")).toHaveText("1");
    await expect(page.getByTestId("page")).toHaveText("Protected");
    await expect(page).toHaveURL(protectedUrl);
    await expect(page.getByTestId("route-changes")).toHaveText(routeChanges ?? "");

    await page.getByTestId("leave").click({ force: true, noWaitAfter: true });
    await expect(page.getByTestId("page")).toHaveText("Origin", { timeout: 15_000 });
  });
}

test("documentation navigation and API examples render", async ({ page }) => {
  await page.goto("http://127.0.0.1:4174/");
  await expect(page.getByRole("heading", { name: "让返回先停一下。" })).toBeVisible();
  await page.getByRole("link", { name: "查看 API" }).click();
  await expect(page.locator(".vp-doc h1")).toContainText("API");
  await expect(page.locator("pre").filter({ hasText: "BackGuardOptions" }).first()).toBeVisible();
});
