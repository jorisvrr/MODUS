import { test, expect, type Page } from "@playwright/test";

/**
 * The homepage's "Start here" section, at both widths, plus the captures
 * the brief asks for.
 *
 * Nothing here submits anything: the section's whole contract is that
 * pressing a chip or typing does not write or send, so a test that
 * submitted would be testing something else.
 */
const SHOTS = "e2e-screens";

async function entryForm(page: Page) {
  return page.locator("form").filter({ has: page.getByLabel(/What would you like to improve/i) });
}

for (const [name, viewport] of [
  ["desktop", { width: 1440, height: 900 }],
  ["mobile", { width: 390, height: 844 }],
] as const) {
  test(`start here reads and behaves correctly at ${name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("What is taking more time than it should?")).toBeVisible();
    await expect(page.getByLabel("What would you like to improve?")).toBeVisible();
    await expect(page.getByText("No account needed to start.")).toBeVisible();
    await expect(page.getByRole("link", { name: /Find my next step/i })).toBeVisible();

    const form = await entryForm(page);
    for (const chip of [
      "Following up with customers",
      "Planning work",
      "Repetitive admin",
      "Getting more enquiries",
      "Not sure yet",
    ]) {
      await expect(form.getByRole("button", { name: chip, exact: true })).toBeVisible();
    }

    // The retired section is gone from the rendered page, not hidden.
    await expect(page.getByText("Recently Improved")).toHaveCount(0);
    await expect(page.getByText("From fragmented to focused.")).toHaveCount(0);

    await page.getByRole("button", { name: "Planning work", exact: true }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${SHOTS}/home-start-here-${name}.png` });

    // The chips wrap rather than overflow, and the CTA is full-width on a
    // phone. Measured, not assumed: an overflowing row is invisible in a
    // screenshot taken at the right scroll position.
    const box = await form.boundingBox();
    const chip = await form.getByRole("button", { name: "Following up with customers", exact: true }).boundingBox();
    expect(chip!.x + chip!.width).toBeLessThanOrEqual(box!.x + box!.width + 1);
    const cta = await page.getByRole("link", { name: /Find my next step/i }).boundingBox();
    if (name === "mobile") {
      // Within the card's own padding, i.e. filling the available width.
      expect(cta!.width).toBeGreaterThan(box!.width - 60);
    } else {
      expect(cta!.width).toBeLessThan(box!.width / 2);
    }

    // No horizontal overflow anywhere on the page at this width.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow, "the homepage should not scroll horizontally").toBeLessThanOrEqual(0);
  });
}

test("the full homepage, after the removal", async ({ page }) => {
  for (const [name, viewport] of [
    ["desktop", { width: 1440, height: 900 }],
    ["mobile", { width: 390, height: 844 }],
  ] as const) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${SHOTS}/home-full-${name}.png`, fullPage: true });
  }
});
