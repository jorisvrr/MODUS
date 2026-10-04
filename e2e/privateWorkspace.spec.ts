import { test, expect, type Page } from "@playwright/test";
import { requireLocalMutableEnvironment } from "./localOnlyGuard";
import { signInAs, testAccounts } from "./clerkBrowserSession";

/*
 * These tests write real rows to the database, so they refuse to run
 * unless the environment is unmistakably local development.
 */
requireLocalMutableEnvironment();

/**
 * The integration checks the handoff explicitly left open.
 *
 * Its eight browser checks used fixture data and mocked API responses, so
 * they could not show that a stage change reaches the database, that
 * history records it, or that a filtered URL actually filters. These run
 * against the real authenticated API and the real development database,
 * signed in as a real Clerk admin.
 *
 * Local database only — never production.
 */

const env = testAccounts();

async function asAdmin(page: Page) {
  await page.goto("/");
  await signInAs(page, env!.MODUS_TEST_A_EMAIL);
}

/** A disposable record so stage changes and deletion touch nothing real. */
async function createRecord(page: Page, companyName: string) {
  const payload = {
    companyName, website: "", industry: "Restaurant / Café", employees: "1-5",
    locations: "1", revenueRange: "", reachChannels: ["Phone"],
    enquiryHandling: ["Shared inbox"], adminHours: "A few hours",
    processStandardization: 3, dependency: "Low", systems: ["CRM"],
    specificTools: "", connectionLevel: "Partly connected",
    spreadsheetDependency: "Some", automationUsage: ["None"],
    friction: ["Administration"], primaryPain: "Administration",
    problemDescription: "", frequency: "Weekly", impact: ["Time"],
    primaryInterest: "Automation", priorities: ["Save time"],
    timing: "Within 3 months", decisionContext: "",
    firstName: "Workspace", lastName: "QA",
    email: `workspace-${Date.now()}@playwright-qa.dev`, phone: "", role: "",
    preliminaryProfile: [], preliminarySignals: [],
  };
  const res = await page.request.post("/api/diagnostic", {
    data: payload,
    headers: { "Idempotency-Key": `workspace-${companyName}-${Date.now()}` },
  });
  expect(res.ok(), "seed submission should succeed").toBe(true);
  return (await res.json()).id as string;
}

test.describe("admin workspace, against the real API and database", () => {
  test.skip(!env, "run scripts/create-test-users.mjs first");
  test.describe.configure({ mode: "serial" });
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(120_000);

  test("a pipeline stage change persists and is recorded in history", async ({ page }) => {
    await asAdmin(page);
    await page.goto("/private/pipeline");

    /*
     * Operate on a card the board actually shows, rather than seeding a
     * new record. The board deliberately loads the OLDEST 20 per stage,
     * so a freshly created diagnostic is the least likely row to appear —
     * my first attempt seeded one and then could not find it, which was
     * the test being wrong about documented behaviour, not the board.
     */
    /*
     * Identified by record id, not company name. Company names are not
     * unique — the local database holds two different diagnostics both
     * called "Bagel Alley", in different stages, so a name-based locator
     * matched two cards. The id comes from the card's own detail link.
     */
    const firstCard = page.locator("article").filter({ has: page.locator('select[aria-label^="Stage for "]') }).first();
    await expect(firstCard).toBeVisible({ timeout: 25_000 });
    const href = (await firstCard.getByRole("link").first().getAttribute("href"))!;
    const id = href.split("/").pop()!;
    const select = firstCard.locator("select");
    const original = await select.inputValue();
    const target = original === "REVIEWING" ? "REVIEWED" : "REVIEWING";

    const statusOf = async () => {
      const res = await page.request.get(`/api/private/diagnostics?q=${id}`);
      if (res.ok()) {
        const match = (await res.json()).diagnostics.find((d: { id: string }) => d.id === id);
        if (match) return match.status as string;
      }
      // The search does not index ids; fall back to the record page.
      return null;
    };

    try {
      await select.selectOption(target);
      // Confirmed by the server, not optimistic: the board announces only
      // after the PATCH resolved. The handoff's fixture checks mocked that
      // response and so could not show it reaching the database.
      await expect(page.getByRole("status")).toContainText(/Saved/i, { timeout: 25_000 });

      // The actual persistence claim: still true on the record itself
      // after a full reload, read back through the authenticated API.
      await page.reload();
      await page.goto(`/private/diagnostics/${id}`);
      await expect(page.getByLabel("Diagnostic status")).toHaveValue(target, { timeout: 25_000 });
      // And the database recorded why.
      await expect(page.getByText(`Status → ${target}`).first()).toBeVisible({ timeout: 25_000 });
      void statusOf;
    } finally {
      // Put it back, so a verification run leaves no workflow change behind.
      await page.goto(`/private/diagnostics/${id}`);
      const restore = page.getByLabel("Diagnostic status");
      if (await restore.isVisible().catch(() => false)) {
        await restore.selectOption(original);
        // `.first()`: a record accumulates one activity entry per change,
        // so after repeated runs several read identically.
        await expect(page.getByText(`Status → ${original}`).first()).toBeVisible({ timeout: 25_000 });
      }
    }
  });

  test("a filtered URL opens already filtered", async ({ page }) => {
    await asAdmin(page);
    await page.goto("/private/diagnostics?status=QUALIFIED");
    // The control reflects the URL rather than defaulting to All.
    const status = page.locator("select").first();
    await expect(status).toHaveValue("QUALIFIED", { timeout: 20_000 });
    // And the listing agrees: every visible row is that status.
    const pills = page.locator("tbody tr td:last-child");
    const count = await pills.count();
    for (let i = 0; i < count; i++) {
      await expect(pills.nth(i)).toHaveText(/Qualified/i);
    }
  });

  test("Refresh re-reads the list from the server", async ({ page }) => {
    await asAdmin(page);
    await page.goto("/private/diagnostics");
    await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: 20_000 });

    let refetched = false;
    page.on("request", (r) => {
      if (r.url().includes("/api/private/diagnostics?")) refetched = true;
    });
    await page.getByRole("button", { name: /Refresh/i }).click();
    await expect.poll(() => refetched, { timeout: 20_000 }).toBe(true);
  });

  test("a failed pricing save keeps the typed inputs", async ({ page }) => {
    await asAdmin(page);
    const company = `Pricing QA ${Date.now()}`;
    const id = await createRecord(page, company);
    await page.goto(`/private/diagnostics/${id}`);

    const min = page.locator('input[type="number"]').first();
    await expect(min).toBeVisible({ timeout: 20_000 });
    await min.fill("1234");

    await page.route(`**/api/private/diagnostics/${id}`, (route) =>
      route.request().method() === "PATCH"
        ? route.fulfill({ status: 500, contentType: "application/json", body: "{}" })
        : route.continue()
    );
    await page.getByRole("button", { name: /^Save$/ }).first().click();

    await expect(page.getByRole("alert").filter({ hasText: /Not saved/i }).first()).toBeVisible({ timeout: 20_000 });
    // The value the reviewer typed is still there to retry with.
    await expect(min).toHaveValue("1234");
  });

  test("a successful delete returns to the inbox and removes the record", async ({ page }) => {
    await asAdmin(page);
    const company = `Delete QA ${Date.now()}`;
    const id = await createRecord(page, company);
    await page.goto(`/private/diagnostics/${id}`);

    const hold = page.getByRole("button", { name: /Hold to Delete Diagnostic/i });
    await expect(hold).toBeVisible({ timeout: 20_000 });
    await hold.hover();
    await page.mouse.down();
    await page.waitForTimeout(1800);
    await page.mouse.up();

    await expect(page).toHaveURL(/\/private\/diagnostics$/, { timeout: 20_000 });
    const gone = await page.request.get(`/api/private/diagnostics?q=${encodeURIComponent(company)}`);
    expect((await gone.json()).total, "the deleted record should be gone").toBe(0);
  });
});
