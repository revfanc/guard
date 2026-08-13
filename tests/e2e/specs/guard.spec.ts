import { expect, test, type Page } from "@playwright/test";

async function enterProtected(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByTestId("enter").click();
  await expect(page.getByTestId("page")).toHaveText("Protected");
}

async function requestBack(page: Page): Promise<void> {
  const requests = page.getByTestId("back-requests");
  const previous = Number(await requests.textContent());
  await page.getByTestId("back").dispatchEvent("click");
  await expect(requests).toHaveText(String(previous + 1));
}

test.describe("vanilla History API guard", () => {
  test("stay keeps the page protected and allows a later attempt", async ({ page }) => {
    await enterProtected(page);

    await requestBack(page);
    await expect(page.getByTestId("a-attempts")).toHaveText("1");
    await page.getByTestId("stay").dispatchEvent("click");
    await expect(page.getByTestId("decision")).toHaveText("stay:true");

    await requestBack(page);
    await expect(page.getByTestId("a-attempts")).toHaveText("2");
    await expect(page.getByTestId("page")).toHaveText("Protected");
  });

  test("final done runs history.back after returning to the protected base", async ({ page }) => {
    await enterProtected(page);

    await requestBack(page);
    await expect(page.getByTestId("a-attempts")).toHaveText("1");
    await page.getByTestId("done-back").dispatchEvent("click");
    await expect(page.getByTestId("decision")).toHaveText("done-back:true");

    await expect(page.getByTestId("page")).toHaveText("Origin");
    await expect(page).toHaveURL(/screen=origin/);
  });

  test("a paused LIFO attempt resumes after the top guard is disposed", async ({ page }) => {
    await enterProtected(page);
    await requestBack(page);
    await expect(page.getByTestId("a-attempts")).toHaveText("1");

    await page.getByTestId("add-b").dispatchEvent("click");
    await expect(page.getByTestId("decision")).toHaveText("b-added");
    await requestBack(page);
    await expect(page.getByTestId("b-attempts")).toHaveText("1");

    await page.getByTestId("try-a-done").dispatchEvent("click");
    await expect(page.getByTestId("decision")).toHaveText("a-paused:false");
    await expect(page.getByTestId("actions")).toHaveText("0");

    await page.getByTestId("dispose-b").dispatchEvent("click");
    await expect(page.getByTestId("decision")).toHaveText("b-disposed");
    await page.getByTestId("resume-a-done").dispatchEvent("click");
    await expect(page.getByTestId("decision")).toHaveText("a-resumed:true");
    await expect(page.getByTestId("actions")).toHaveText("1");
    await expect(page.getByTestId("a-attempts")).toHaveText("1");
  });

  test("a valid done action may replace the document", async ({ page }) => {
    await enterProtected(page);

    await requestBack(page);
    await expect(page.getByTestId("a-attempts")).toHaveText("1");
    await page.getByTestId("done-replace").dispatchEvent("click");

    await expect(page).toHaveURL(/screen=replaced/);
    await expect(page.getByTestId("page")).toHaveText("Replaced");
  });
});
