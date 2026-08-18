import { expect, test, type Page } from "@playwright/test";

async function ready(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByTestId("path")).toHaveText("/c");
  await expect(page.getByTestId("content")).toHaveText("C");
}

async function click(page: Page, name: string): Promise<void> {
  await page.getByTestId(name).click();
}

test.describe("Vue Router POP Guard", () => {
  test.beforeEach(async ({ page }) => ready(page));

  test("rejects and then allows Back without changing page content early", async ({ page }) => {
    await click(page, "back");
    await expect(page.getByTestId("a-attempts")).toHaveText("1");
    await expect(page.getByTestId("path")).toHaveText("/c");
    await click(page, "deny-a");
    await expect(page).toHaveURL(/\/c$/);
    await expect(page.getByTestId("content")).toHaveText("C");

    await click(page, "back");
    await expect(page.getByTestId("a-attempts")).toHaveText("2");
    await click(page, "allow-a");
    await expect(page).toHaveURL(/\/b$/);
    await expect(page.getByTestId("path")).toHaveText("/b");
    await expect(page.getByTestId("content")).toHaveText("B");
  });

  test("guards Forward and preserves the forward stack after rejection", async ({ page }) => {
    await click(page, "minus-two");
    await expect(page.getByTestId("a-attempts")).toHaveText("1");
    await click(page, "allow-a");
    await expect(page).toHaveURL(/\/a$/);

    await click(page, "add-a");
    await click(page, "plus-two");
    await expect(page.getByTestId("a-attempts")).toHaveText("2");
    await click(page, "deny-a");
    await expect(page).toHaveURL(/\/a$/);

    await click(page, "plus-two");
    await expect(page.getByTestId("a-attempts")).toHaveText("3");
    await click(page, "allow-a");
    await expect(page).toHaveURL(/\/c$/);
    await expect(page.getByTestId("content")).toHaveText("C");
  });

  test("consumes nested guards in LIFO order", async ({ page }) => {
    await click(page, "add-b");
    await click(page, "back");
    await expect(page.getByTestId("b-attempts")).toHaveText("1");
    await expect(page.getByTestId("a-attempts")).toHaveText("0");
    await click(page, "allow-b");
    await expect(page).toHaveURL(/\/c$/);

    await click(page, "back");
    await expect(page.getByTestId("a-attempts")).toHaveText("1");
    await click(page, "allow-a");
    await expect(page).toHaveURL(/\/b$/);
  });

  test("does not invoke a pending Handler again", async ({ page }) => {
    await click(page, "back");
    await expect(page.getByTestId("a-attempts")).toHaveText("1");
    await click(page, "back");
    await expect(page).toHaveURL(/\/a$/);
    await expect(page.getByTestId("a-attempts")).toHaveText("1");
    await click(page, "deny-a");
    await expect(page).toHaveURL(/\/c$/);
    await expect(page.getByTestId("content")).toHaveText("C");
  });

  test("stopping the active layer invalidates allow and rejects the POP", async ({ page }) => {
    await click(page, "back");
    await expect(page.getByTestId("a-attempts")).toHaveText("1");
    await click(page, "stop-a");
    await click(page, "allow-a");
    await expect(page).toHaveURL(/\/c$/);
    await expect(page.getByTestId("content")).toHaveText("C");
  });

  test("does not guard push or replace and writes no library history state", async ({ page }) => {
    const before = await page.evaluate(() => history.state);
    await click(page, "add-b");
    await click(page, "stop-b");
    const afterRegistration = await page.evaluate(() => history.state);
    expect(afterRegistration).toEqual(before);

    await click(page, "push");
    await expect(page).toHaveURL(/\/d$/);
    await click(page, "replace");
    await expect(page).toHaveURL(/\/a$/);
    await expect(page.getByTestId("a-attempts")).toHaveText("0");
  });
});
