import { test, expect, type Page } from "@playwright/test";

/**
 * Account isolation, verified against the running app.
 *
 * The saved Diagnostic reference is a capability token plus a company
 * name. It used to be scoped to the browser rather than to an account, so
 * after a sign-out or an account switch the next person was shown the
 * previous account's company name and offered their profile.
 *
 * Clerk is not signed in during these runs, so the live identity is
 * "guest". That is enough to prove the rule in both directions: a
 * reference belonging to a signed-in account must not be honoured for a
 * guest, and the guest's own reference must still work — the second half
 * matters, because a change that simply broke the feature would pass the
 * first half on its own.
 */

const KEY = "modus:customer-context:v1";

async function seed(page: Page, identity: string, companyName: string) {
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [
      KEY,
      JSON.stringify({ contextToken: "tok_not_a_real_token", companyName, savedAt: Date.now(), identity }),
    ] as const
  );
}

const stored = (page: Page) => page.evaluate((k) => window.localStorage.getItem(k), KEY);

test.describe("a reference belonging to another account", () => {
  test("is neither shown nor kept, and the generic site is restored", async ({ page }) => {
    await seed(page, "user_someone_else", "Another Persons Company BV");

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // The data itself, not merely a hidden element: the company name must
    // not appear anywhere in the rendered page.
    await expect(page.locator("body")).not.toContainText("Another Persons Company BV");

    // The navigation offers the generic action, not "Continue"/"View
    // Profile" built from someone else's state.
    await expect(page.locator("header").getByRole("link", { name: /Run a Diagnostic/i })).toBeVisible();

    // And the token is gone from storage, not just ignored — otherwise
    // anyone with the device could read it out and call the public
    // context endpoint with it.
    await expect.poll(() => stored(page), { timeout: 5000 }).toBeNull();
  });

  test("does not open the profile screen on /diagnostic", async ({ page }) => {
    await seed(page, "user_someone_else", "Another Persons Company BV");

    await page.goto("/diagnostic");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(/PROFILE READY/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Start|Begin/i }).first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Another Persons Company BV");
  });

  test("survives a reload and browser Back without reappearing", async ({ page }) => {
    await seed(page, "user_someone_else", "Another Persons Company BV");

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.goto("/pricing");
    await page.waitForLoadState("networkidle");
    await page.goBack();
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).not.toContainText("Another Persons Company BV");

    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).not.toContainText("Another Persons Company BV");
    expect(await stored(page)).toBeNull();
  });
});

test.describe("the current identity's own reference still works", () => {
  test("a guest reference is honoured and kept", async ({ page }) => {
    await seed(page, "guest", "Guest Owned Company BV");

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Still present: scoping must not be implemented by deleting
    // everything, which would pass the isolation tests while removing the
    // feature.
    expect(await stored(page)).not.toBeNull();
    await expect(
      page.locator("header").getByRole("link", { name: /Run a Diagnostic/i })
    ).toHaveCount(0);
  });
});

test.describe("the admin tab never opens for a non-admin", () => {
  test("no second tab is opened for an anonymous visitor", async ({ page, context }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);
    // Signing in is not a reason to open the admin inbox; confirmed
    // membership is. An anonymous visitor must never see it.
    expect(context.pages()).toHaveLength(1);
    await expect(page.getByRole("link", { name: /Open admin inbox/i })).toHaveCount(0);
  });

  test("/api/admin/status is the authority and answers false here", async ({ request }) => {
    const res = await request.get("/api/admin/status");
    expect(res.ok()).toBe(true);
    expect(await res.json()).toEqual({ admin: false });
  });
});

test.describe("a guest's own work in progress survives", () => {
  test("an unfinished diagnostic is still offered to resume", async ({ page }) => {
    /*
     * The guest DRAFT is separate from the account-scoped reference: it
     * lives in sessionStorage, holds answers the person at this browser
     * typed themselves, and is not account data. Scoping the reference
     * must not have thrown it away.
     *
     * No submission is made, so this creates no record anywhere.
     */
    await page.goto("/diagnostic");
    await page.getByRole("button", { name: /Start|Begin/i }).first().click();
    await expect(page.getByText("01 / 06")).toBeVisible();
    await page.getByLabel("Company name").fill("Guest Draft Co");
    // Wait for the draft to actually be written before navigating, rather
    // than racing the effect that saves it.
    await expect
      .poll(() => page.evaluate(() => sessionStorage.getItem("modus:diagnostic:v1")), { timeout: 5000 })
      .toContain("Guest Draft Co");

    // Leave the diagnostic entirely.
    await page.goto("/pricing");
    await page.waitForLoadState("networkidle");

    await page.goto("/diagnostic");
    await page.waitForLoadState("networkidle");

    /*
     * Answer the consent banner first, as a visitor would. Overlays are
     * arbitrated through `useOverlaySlot`, and the consent banner holds
     * the slot until it is answered — so the recovery prompt is queued
     * behind it rather than missing. Not answering it here read as "the
     * draft was lost", which it was not.
     */
    const accept = page.getByRole("button", { name: /Accept All/i });
    if (await accept.isVisible().catch(() => false)) await accept.click();

    // The draft is offered back, with the typed answer intact.
    const resume = page.getByRole("button", { name: /Continue Diagnostic/i }).first();
    await expect(resume).toBeVisible({ timeout: 10000 });
    await resume.click();
    await expect(page.getByLabel("Company name")).toHaveValue("Guest Draft Co");
  });
});

/**
 * The homepage's start context is the visitor's own sentence about where
 * their business is stuck, so it is scoped exactly like the saved
 * reference above — and for the same reason. Unscoped, the next person at
 * this browser would be greeted with the previous one's words.
 */
const ENTRY_KEY = "modus:entry-context:v1";

async function seedEntryContext(page: Page, identity: string, text: string) {
  await page.addInitScript(
    ([key, value]) => window.sessionStorage.setItem(key, value),
    [ENTRY_KEY, JSON.stringify({ topics: ["Planning work"], text, savedAt: Date.now(), identity })] as const
  );
}

const storedEntry = (page: Page) =>
  page.evaluate((k) => window.sessionStorage.getItem(k), ENTRY_KEY);

test.describe("start context belonging to another account", () => {
  const THEIRS = "our quoting is a mess and only Marco can do it";

  test("is not shown to the next person at this browser", async ({ page }) => {
    await seedEntryContext(page, "user_someone_else", THEIRS);

    await page.goto("/diagnostic");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("You started with")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(THEIRS);
  });

  test("is removed from storage, not merely ignored", async ({ page }) => {
    await seedEntryContext(page, "user_someone_else", THEIRS);

    await page.goto("/diagnostic");
    await page.waitForLoadState("networkidle");

    // Leaving it readable would mean anyone with the device could read the
    // previous account's words straight out of storage.
    await expect.poll(() => storedEntry(page), { timeout: 5000 }).toBeNull();
  });

  test("the current identity's own start context is still honoured", async ({ page }) => {
    // The half that matters just as much: a change that simply broke the
    // feature would pass both tests above on its own.
    await seedEntryContext(page, "guest", "planning the week takes a whole morning");

    await page.goto("/diagnostic");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("You started with")).toBeVisible();
    await expect(page.getByLabel("What you would like to improve")).toHaveValue(
      "planning the week takes a whole morning"
    );
  });
});
