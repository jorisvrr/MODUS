import { test, expect, type Page } from "@playwright/test";
import { requireLocalMutableEnvironment } from "./localOnlyGuard";
import { signInAs, testAccounts } from "./clerkBrowserSession";

requireLocalMutableEnvironment();

/**
 * The diagnostics list retries once on a 401. These are the limits on
 * that, asserted rather than assumed.
 *
 * The retry exists because a 401 means the server saw no session, which
 * has been observed transiently for a token that was valid — and the
 * symptom was an admin told their list failed when nothing was wrong with
 * their access. It must not become a way to get in.
 *
 * Three claims:
 *   1. A persistent 401 still fails, after exactly ONE extra attempt.
 *   2. A 403 — authenticated, not an admin — is NOT retried at all.
 *   3. Neither path renders any record.
 */
const env = testAccounts();

async function asAdmin(page: Page) {
  await page.goto("/");
  await signInAs(page, env!.MODUS_TEST_A_EMAIL);
}

/** Forces every list call to one status, and counts them. */
async function refuseListWith(page: Page, status: number) {
  const calls: number[] = [];
  await page.route("**/api/private/diagnostics?*", async (route) => {
    calls.push(Date.now());
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify({ error: "Unauthorized." }),
    });
  });
  return calls;
}

test.describe("the 401 retry cannot become a way in", () => {
  test.skip(!env, "run scripts/create-test-users.mjs first");
  test.describe.configure({ mode: "serial" });
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(120_000);

  test("a persistent 401 fails, after exactly one extra attempt", async ({ page }) => {
    await asAdmin(page);
    const calls = await refuseListWith(page, 401);

    await page.goto("/private/diagnostics");
    await expect(page.getByText("That didn't load.")).toBeVisible({ timeout: 20_000 });

    // Two attempts, not one and not a loop.
    expect(calls.length, `the list was requested ${calls.length} time(s)`).toBe(2);
    // Nothing is shown. A retry that failed must not leave stale or
    // partial data on screen.
    await expect(page.locator("tbody tr")).toHaveCount(0);
  });

  test("a 403 is not retried at all", async ({ page }) => {
    // Authenticated, but not an admin. There is nothing transient about
    // that answer, and retrying it would be asking a second time for
    // permission that was just refused.
    await asAdmin(page);
    const calls = await refuseListWith(page, 403);

    await page.goto("/private/diagnostics");
    await expect(page.getByText("That didn't load.")).toBeVisible({ timeout: 20_000 });

    expect(calls.length, `a 403 was requested ${calls.length} time(s)`).toBe(1);
    await expect(page.locator("tbody tr")).toHaveCount(0);
  });

  test("the retry changes nothing about who the server lets in", async ({ page }) => {
    /*
     * The authority is the API, not the page. `/api/admin/status` and the
     * list endpoint both go through `requireAdminSession`, which re-reads
     * the AdminMember row on every request — the retry is a second call
     * to that same gate, not a second answer from it.
     */
    await page.goto("/");
    const res = await page.request.get("/api/private/diagnostics?page=1&pageSize=25");
    expect(res.status(), "an anonymous caller must be refused").toBe(401);

    // And twice refused is still refused: a second identical call cannot
    // succeed where the first failed.
    const again = await page.request.get("/api/private/diagnostics?page=1&pageSize=25");
    expect(again.status()).toBe(401);
  });
});
