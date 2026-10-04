import { test, expect } from "@playwright/test";

/**
 * The diagnostic graphic on the deployed site, WITHOUT submitting.
 *
 * `diagnosticScene.spec.ts` walks the whole journey and submits, which
 * against production would create records nobody authorised. This checks
 * the same visual claims up to the point of submission and stops there:
 * the opening cloud, the per-step explanation, the summary appearing only
 * once something is actually answered, and the absence of every surface
 * the rebuild retired.
 *
 * Nothing here is written: the one answer it fills is a company name on
 * an unsubmitted form.
 *
 * Run with MODUS_E2E_BASE_URL to point it at a deployment.
 */
test.describe("diagnostic graphic on the deployment", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(120_000);

  test("one composition that grows with the answers, and says why", async ({ page }) => {
    await page.goto("/diagnostic");
    await page.waitForLoadState("domcontentloaded");

    // Entry: exactly one canvas, and the explanation of why anything is
    // being asked — which is the whole reason the graphic is there.
    await expect(page.locator("canvas")).toHaveCount(1, { timeout: 20_000 });
    await expect(page.getByText("Why we ask")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Six topics make one picture.")).toBeVisible();

    // The retired surfaces must be gone, not relocated: the node-map card,
    // its pill menu, the signals verdict on a half-finished answer set,
    // the placeholder sentences, and the six projected labels.
    await expect(page.getByText(/INITIAL PROFILE/i)).toHaveCount(0);
    for (const pill of ["OPERATIONS", "AUTOMATION", "REVENUE", "DATA"]) {
      await expect(page.getByText(pill, { exact: true })).toHaveCount(0);
    }
    await expect(page.getByText(/Preliminary Signals/i)).toHaveCount(0);
    await expect(page.getByText(/watching for signals/i)).toHaveCount(0);
    await expect(page.getByText(/profile will build here/i)).toHaveCount(0);
    await expect(page.locator("[data-layer]")).toHaveCount(0);

    await page.getByRole("button", { name: /Start|Begin/i }).first().click();
    await expect(page.getByText("01 / 06")).toBeVisible();

    // Still exactly one canvas — one composition, not a scene plus a card.
    await expect(page.locator("canvas")).toHaveCount(1);
    // The explanation is the current step's, and nothing is summarised
    // before anything has been answered.
    await expect(page.getByText(/Size, sector and locations set what counts as normal/i)).toBeVisible();
    await expect(page.getByText(/Recorded so far/i)).toHaveCount(0);

    // Answering is what makes the summary appear, with the real answer in
    // it. No submission: this runs against a deployment.
    await page.getByLabel("Company name").fill("Deployment check");
    await expect(page.getByText(/Recorded so far/i)).toBeVisible();
    await expect(page.getByText("1 of 6 topics recorded")).toBeVisible();
    await expect(page.getByText("Deployment check", { exact: true })).toBeVisible();

    await page.screenshot({ path: "e2e-screens/production-graphic.png" });
  });

  test("no WebGL below the desktop threshold", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await page.goto("/diagnostic");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2500);
    await expect(page.locator("canvas")).toHaveCount(0);
  });
});
