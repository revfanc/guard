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

test.describe("Back decisions", () => {
  test.beforeEach(async ({ page }) => enterProtected(page));

  test("settling without allow stays and permits a later attempt", async ({ page }) => {
    await requestBack(page);
    await expect(page.getByTestId("a-attempts")).toHaveText("1");
    await page.getByTestId("deny-attempt").dispatchEvent("click");
    await expect(page.getByTestId("decision")).toHaveText("attempt:denied");

    await requestBack(page);
    await expect(page.getByTestId("a-attempts")).toHaveText("2");
    await expect(page.getByTestId("page")).toHaveText("Protected");
  });

  test("allow continues the original Back", async ({ page }) => {
    await requestBack(page);
    await expect(page.getByTestId("a-attempts")).toHaveText("1");
    await page.getByTestId("allow-attempt").dispatchEvent("click");
    await expect(page.getByTestId("decision")).toHaveText("attempt:true");

    await expect(page.getByTestId("page")).toHaveText("Origin");
    await expect(page).toHaveURL(/screen=origin/);
  });

  test("a lower pending attempt resumes after the top guard is disposed", async ({ page }) => {
    await requestBack(page);
    await expect(page.getByTestId("a-attempts")).toHaveText("1");

    await page.getByTestId("add-b").dispatchEvent("click");
    await requestBack(page);
    await expect(page.getByTestId("b-attempts")).toHaveText("1");

    await page.getByTestId("try-a-allow").dispatchEvent("click");
    await expect(page.getByTestId("decision")).toHaveText("a-paused:false");

    await page.getByTestId("dispose-b").dispatchEvent("click");
    await expect(page.getByTestId("decision")).toHaveText("b:disposed");
    await page.getByTestId("resume-a-allow").dispatchEvent("click");
    await expect(page.getByTestId("decision")).toHaveText("a-resumed:true");
    await expect(page).toHaveURL(/screen=origin/);
  });

  test("allowing a top logical guard consumes only that layer", async ({ page }) => {
    await page.getByTestId("add-b").dispatchEvent("click");
    await requestBack(page);
    await expect(page.getByTestId("b-attempts")).toHaveText("1");
    await page.getByTestId("allow-b").dispatchEvent("click");
    await expect(page.getByTestId("decision")).toHaveText("b-allowed:true");
    await expect(page.getByTestId("page")).toHaveText("Protected");
    await expect(page).toHaveURL(/screen=protected/);

    await requestBack(page);
    await expect(page.getByTestId("a-attempts")).toHaveText("1");
  });

  test("awaited disposal permits an active document replacement", async ({ page }) => {
    await page.getByTestId("dispose-replace").dispatchEvent("click");

    await expect(page).toHaveURL(/screen=replaced/);
    await expect(page.getByTestId("page")).toHaveText("Replaced");
  });

  test("repeated Back while deciding does not duplicate the pending attempt", async ({ page }) => {
    await requestBack(page);
    await expect(page.getByTestId("a-attempts")).toHaveText("1");
    await expect
      .poll(() => page.evaluate(() => history.state?.__revfanc_guard__))
      .toEqual(expect.any(Boolean));
    await requestBack(page);
    await expect(page.getByTestId("a-attempts")).toHaveText("1");
    await expect(page.getByTestId("page")).toHaveText("Protected");
    await expect(page).toHaveURL(/screen=protected/);
  });

  test("same-task double Back either remains guarded or stops without rewriting state", async ({
    page,
    browserName,
  }) => {
    test.setTimeout(30_000);

    await page.evaluate(() => {
      history.back();
      history.back();
    });
    await expect
      .poll(
        async () => Number(await page.getByTestId("popstates").textContent()),
        { timeout: 15_000 },
      )
      .toBeGreaterThan(0);
    await page.waitForTimeout(browserName === "webkit" ? 1_000 : 250);

    const result = await page.evaluate(() => ({
      decision: document.querySelector('[data-testid="decision"]')?.textContent,
      marker: history.state?.__revfanc_guard__,
      page: document.querySelector('[data-testid="page"]')?.textContent,
      popstates: Number(
        document.querySelector('[data-testid="popstates"]')?.textContent,
      ),
      screen: new URLSearchParams(location.search).get("screen"),
      state: history.state,
    }));

    expect([1, 2]).toContain(result.popstates);
    if (result.screen === "protected") {
      expect(result.page).toBe("Protected");
      expect(result.marker).toEqual(expect.any(Boolean));
      expect(result.state).toMatchObject({ screen: "protected" });
    } else {
      expect(result.screen).toBe("origin");
      expect(result.page).toBe("Origin");
      expect(result.decision).toContain("missed the guarded base");
      expect(result.marker).toBeUndefined();
      expect(result.state).toEqual({ screen: "origin" });
    }
  });

  test("history.go(-2) stops the guard without rewriting the destination", async ({ page }) => {
    await page.evaluate(() => history.go(-2));

    await expect(page).toHaveURL(/screen=origin/, { timeout: 15_000 });
    await expect(page.getByTestId("decision")).toContainText(
      "missed the guarded base",
    );
    await expect(page.getByTestId("a-attempts")).toHaveText("0");
    await expect
      .poll(() => page.evaluate(() => history.state))
      .toEqual({ screen: "origin" });
  });
});
