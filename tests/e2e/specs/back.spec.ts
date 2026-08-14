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

test.describe("Back resolution", () => {
  test.beforeEach(async ({ page }) => enterProtected(page));

  test("resolve without an action stays and permits a later attempt", async ({ page }) => {
    await requestBack(page);
    await expect(page.getByTestId("a-attempts")).toHaveText("1");
    await page.getByTestId("resolve-attempt").dispatchEvent("click");
    await expect(page.getByTestId("decision")).toHaveText("attempt:true");

    await requestBack(page);
    await expect(page.getByTestId("a-attempts")).toHaveText("2");
    await expect(page.getByTestId("page")).toHaveText("Protected");
  });

  test("final action starts from the clean protected base", async ({ page }) => {
    await requestBack(page);
    await expect(page.getByTestId("a-attempts")).toHaveText("1");
    await page.getByTestId("resolve-back").dispatchEvent("click");
    await expect(page.getByTestId("decision")).toHaveText("back:true");

    await expect(page.getByTestId("page")).toHaveText("Origin");
    await expect(page).toHaveURL(/screen=origin/);
    await expect(page.getByTestId("action-base")).toHaveText(
      "?screen=protected:false",
    );
  });

  test("a lower pending attempt resumes after the top guard resolves", async ({ page }) => {
    await requestBack(page);
    await expect(page.getByTestId("a-attempts")).toHaveText("1");

    await page.getByTestId("add-b").dispatchEvent("click");
    await expect(page.getByTestId("decision")).toHaveText("b:added");
    await requestBack(page);
    await expect(page.getByTestId("b-attempts")).toHaveText("1");

    await page.getByTestId("try-a-action").dispatchEvent("click");
    await expect(page.getByTestId("decision")).toHaveText("a-paused:false");
    await expect(page.getByTestId("actions")).toHaveText("0");

    await page.getByTestId("resolve-b").dispatchEvent("click");
    await expect(page.getByTestId("decision")).toHaveText("b:true");
    await page.getByTestId("resume-a-action").dispatchEvent("click");
    await expect(page.getByTestId("decision")).toHaveText("a-resumed:true");
    await expect(page.getByTestId("actions")).toHaveText("1");
    await expect(page.getByTestId("a-attempts")).toHaveText("1");
  });

  test("a valid action may replace the document", async ({ page }) => {
    await requestBack(page);
    await expect(page.getByTestId("a-attempts")).toHaveText("1");
    await page.getByTestId("resolve-replace").dispatchEvent("click");

    await expect(page).toHaveURL(/screen=replaced/);
    await expect(page.getByTestId("page")).toHaveText("Replaced");
  });

  test("repeated Back while deciding does not duplicate the pending attempt", async ({ page }) => {
    await requestBack(page);
    await expect(page.getByTestId("a-attempts")).toHaveText("1");
    await expect
      .poll(() => page.evaluate(() => history.state?.__revfanc_guard__))
      .toEqual(expect.any(String));
    await requestBack(page);
    await expect(page.getByTestId("a-attempts")).toHaveText("1");
    await expect(page.getByTestId("page")).toHaveText("Protected");
    await expect(page).toHaveURL(/screen=protected/);
  });
});
