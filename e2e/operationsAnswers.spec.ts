import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { requireLocalMutableEnvironment } from "./localOnlyGuard";
import { signInAs, testAccounts } from "./clerkBrowserSession";

requireLocalMutableEnvironment();

/**
 * How the two rewritten operations questions read in the admin workspace,
 * for the three shapes that exist in the database.
 *
 * 1. A record answered AFTER October 2026, with a real answer.
 * 2. A record answered after, where the visitor chose the honest unknown —
 *    "Not applicable — I work alone."
 * 3. A record from BEFORE the rewrite, which has only the old 1-5 rating
 *    and Low/Medium/High level.
 *
 * The rule under test is the same in all three: an unknown is not a low
 * score, and a historical answer keeps the meaning it was recorded under.
 */
const env = testAccounts();
const prisma = new PrismaClient();

async function asAdmin(page: Page) {
  await page.goto("/");
  await signInAs(page, env!.MODUS_TEST_A_EMAIL);
}

test.describe("operations answers in the admin workspace", () => {
  test.skip(!env, "run scripts/create-test-users.mjs first");
  test.describe.configure({ mode: "serial" });
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(120_000);

  test("a real answer is shown as the visitor gave it", async ({ page }) => {
    /*
     * A record with a REAL answer. `not: null` is not enough on its own:
     * the column also holds the empty string for a submission that reached
     * the API without one, and an empty expectation matches everything.
     */
    const record = await prisma.diagnostic.findFirst({
      // Only `taskConsistency` matters here, so a record is not excluded
      // for the answer it gave to the OTHER question.
      where: { taskConsistency: { not: null }, NOT: [{ taskConsistency: "" }] },
      orderBy: { createdAt: "desc" },
    });
    test.skip(!record, "no post-rewrite record with a real answer in the local database");
    expect(record!.taskConsistency!.length).toBeGreaterThan(0);

    await asAdmin(page);
    await page.goto(`/private/diagnostics/${record!.id}`);
    await expect(page.getByText("Same steps for recurring tasks")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(record!.taskConsistency!, { exact: false })).toBeVisible();
    await page.screenshot({ path: "e2e-screens/admin-ops-answered.png" });
  });

  test('"I work alone" is shown as what they said, not as a dependency', async ({ page }) => {
    const record = await prisma.diagnostic.findFirst({
      where: { absenceCoverage: { contains: "alone" } },
      orderBy: { createdAt: "desc" },
    });
    test.skip(!record, "no works-alone record in the local database");

    // The derived legacy level is EMPTY for this answer, not "High". That
    // is the part of the mapping that refuses to turn an absence of
    // information into a negative finding, and it is what the admin view
    // then has nothing to misreport.
    expect(record!.keyEmployeeDependency).toBe("");

    await asAdmin(page);
    await page.goto(`/private/diagnostics/${record!.id}`);
    await expect(page.getByText("A colleague can take over")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Not applicable — I work alone.")).toBeVisible();
    // Never relabelled as a dependency level, and never as unanswered.
    const body = await page.locator("main").innerText();
    expect(body).not.toMatch(/A colleague can take over[\s\S]{0,40}\b(High|Medium|Low)\b/);
    await page.screenshot({ path: "e2e-screens/admin-ops-works-alone.png" });
  });

  test("a pre-rewrite record keeps the meaning it was recorded under", async ({ page }) => {
    const record = await prisma.diagnostic.findFirst({
      where: { taskConsistency: null, processStandardization: { not: null } },
      orderBy: { createdAt: "desc" },
    });
    test.skip(!record, "no pre-rewrite record in the local database");

    await asAdmin(page);
    await page.goto(`/private/diagnostics/${record!.id}`);
    await expect(page.getByText("Same steps for recurring tasks")).toBeVisible({ timeout: 20_000 });
    // Shown as the rating it was, under the question that was actually
    // asked — not silently reinterpreted as one of the new answers.
    await expect(
      page.getByText(`${record!.processStandardization} / 5`, { exact: false })
    ).toBeVisible();
    await expect(page.getByText(/How standardized are your processes/i)).toBeVisible();
    await page.screenshot({ path: "e2e-screens/admin-ops-historical.png" });
  });
});
