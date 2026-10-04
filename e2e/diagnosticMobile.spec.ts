import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { requireLocalMutableEnvironment } from "./localOnlyGuard";
import { clickFirstOptionNear } from "./diagnosticForm";
import { holdToSubmit } from "./holdToSubmit";

/*
 * This writes real rows, so it refuses to run outside local development.
 */
requireLocalMutableEnvironment();

/**
 * The whole diagnostic on a phone, from the homepage to a row in the
 * database.
 *
 * This did not exist, and its absence hid a real defect: the consent
 * banner is full-bleed and `fixed` at the bottom below `sm`, which is
 * exactly where the form's "Continue" button sits, so the primary action
 * was unclickable. Nothing caught it because no test had walked the flow
 * at phone width.
 *
 * So the banner is deliberately NOT dismissed here. Leaving it up is the
 * point: every press has to work with it on screen.
 */

const PHONE = { width: 390, height: 844 };
const prisma = new PrismaClient();

async function remove(email: string) {
  try {
    await prisma.notificationOutbox.deleteMany({ where: { recipient: email } });
    await prisma.diagnostic.deleteMany({ where: { email } });
  } catch {
    // The assertions report a missing database far more clearly.
  }
}

/** Fills the step the keyboard actually has to reach. */
async function fillStep1(page: Page, company: string) {
  await page.getByLabel("Company name").fill(company);
  await page.locator("select").first().selectOption({ index: 1 });
  await clickFirstOptionNear(page, "Employees");
  await clickFirstOptionNear(page, "Locations");
}

async function answerThroughPriorities(page: Page) {
  await page.getByRole("button", { name: /^Continue$/ }).click();
  await clickFirstOptionNear(page, "reach you");
  await page.getByRole("button", { name: /^Continue$/ }).click();
  await clickFirstOptionNear(page, "runs your business");
  await clickFirstOptionNear(page, "connected are these systems");
  await page.getByRole("button", { name: /^Continue$/ }).click();
  await clickFirstOptionNear(page, "harder than it should");
  await page.getByRole("button", { name: /^Continue$/ }).click();
  await clickFirstOptionNear(page, "primarily interested in");
  await clickFirstOptionNear(page, "biggest difference");
  await clickFirstOptionNear(page, "ideally start");
  await page.getByRole("button", { name: /^Continue$/ }).click();
}

test.describe("the diagnostic on a phone", () => {
  test.use({ viewport: PHONE });
  test.setTimeout(180_000);

  test("homepage to a saved row, with the consent banner up the whole way", async ({ page }) => {
    const email = `mobile-${Date.now()}@playwright-qa.dev`;
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });

    await page.goto("/");
    // The banner is up, and stays up.
    const banner = page.getByRole("dialog").filter({ hasText: /PRIVACY/i });
    await expect(banner).toBeVisible();

    // --- the homepage entry, by keyboard -----------------------------
    const field = page.getByLabel("What would you like to improve?");
    await field.click();
    await page.keyboard.type("offertes blijven liggen");
    await expect(field).toHaveValue("offertes blijven liggen");
    // Tab from the field lands on the first chip, and Space toggles it:
    // the chips are buttons, not decoration.
    await page.keyboard.press("Tab");
    await page.keyboard.press(" ");
    await expect(
      page.getByRole("button", { name: "Following up with customers", exact: true })
    ).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("link", { name: /Find my next step/i }).click();
    await expect(page).toHaveURL(/\/diagnostic$/);

    // What they wrote came across, and is editable here.
    await expect(page.getByText("You started with")).toBeVisible();
    await expect(page.getByLabel("What you would like to improve")).toHaveValue(
      "offertes blijven liggen"
    );
    await expect(banner).toBeVisible();
    await page.screenshot({ path: "e2e-screens/mobile-01-intro-with-context.png" });

    // --- the form ----------------------------------------------------
    await page.getByRole("button", { name: /Start|Begin/i }).first().click();
    await expect(page.getByText("01 / 06")).toBeVisible();
    // No canvas on a phone; the explanation is there as text.
    await expect(page.locator("canvas")).toHaveCount(0);
    await expect(page.getByText(/Size, sector and locations/i)).toBeVisible();

    await fillStep1(page, "Mobile QA BV");
    await expect(page.getByText("1 of 6 topics recorded")).toBeVisible();
    await page.screenshot({ path: "e2e-screens/mobile-02-form.png" });

    /*
     * The press that used to be impossible. `click()` without `force`
     * keeps Playwright's actionability check, which is what reported the
     * consent banner intercepting pointer events — so this assertion is
     * only meaningful because the banner is still on screen.
     */
    await expect(banner).toBeVisible();
    await page.getByRole("button", { name: /^Continue$/ }).click();
    await expect(page.getByText("02 / 06")).toBeVisible();

    await clickFirstOptionNear(page, "reach you");
    await page.getByRole("button", { name: /^Continue$/ }).click();
    await clickFirstOptionNear(page, "runs your business");
    await clickFirstOptionNear(page, "connected are these systems");
    await page.getByRole("button", { name: /^Continue$/ }).click();

    // The carried text becomes an answer only when asked for.
    const description = page.getByLabel("In your own words, what happens?");
    await expect(description).toHaveValue("");
    await clickFirstOptionNear(page, "harder than it should");
    await page.getByRole("button", { name: /^Continue$/ }).click();
    await clickFirstOptionNear(page, "primarily interested in");
    await clickFirstOptionNear(page, "biggest difference");
    await clickFirstOptionNear(page, "ideally start");
    await page.getByRole("button", { name: /^Continue$/ }).click();

    // --- contact, typed -----------------------------------------------
    await page.getByLabel("First name").fill("Mobile");
    await page.getByLabel("Last name").fill("QA");
    const emailField = page.getByLabel("Work email");
    await emailField.click();
    await page.keyboard.type(email);
    await expect(emailField).toHaveValue(email);
    await expect(page.getByText("6 of 6 topics recorded")).toBeVisible();

    await page.getByRole("button", { name: /^Review$/ }).click();
    await expect(page.getByText(/review/i).first()).toBeVisible({ timeout: 5000 });
    for (const group of ["Your work", "What gets in the way", "What matters first"]) {
      await expect(page.getByText(group, { exact: true })).toBeVisible();
    }
    await page.screenshot({ path: "e2e-screens/mobile-03-review.png" });

    // Everything up to here must be clean. The forced failure below
    // produces a console error of its own by design, so the assertion is
    // made now rather than being loosened to accommodate it.
    expect(errors, `console errors before the forced failure:\n${errors.join("\n")}`).toEqual([]);

    // --- a failed submission, then a retry that succeeds ---------------
    let failNext = true;
    await page.route("**/api/diagnostic", async (route) => {
      if (failNext) {
        failNext = false;
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "fail" }),
        });
        return;
      }
      await route.fallback();
    });

    const submit = page.getByRole("button", { name: /Hold to Submit/i });
    await expect(banner).toBeVisible();
    await holdToSubmit(page, submit);
    await expect(page.getByText("That didn't go through.")).toBeVisible({ timeout: 15000 });
    // Nothing claims a save, and the answers are still here.
    await expect(page.getByText(/stored with MODUS/i)).toHaveCount(0);
    await page.screenshot({ path: "e2e-screens/mobile-04-submit-error.png" });

    await page.getByRole("button", { name: /Back to review/i }).click();
    await holdToSubmit(page, page.getByRole("button", { name: /Hold to Submit/i }));
    await expect(page.getByText(/ESTIMATE|ENGAGEMENT/i).first()).toBeVisible({ timeout: 20000 });
    await page.screenshot({ path: "e2e-screens/mobile-05-result.png" });

    // --- the row is actually in the database --------------------------
    const saved = await prisma.diagnostic.findFirst({ where: { email } });
    expect(saved, "the submission should be saved").not.toBeNull();
    expect(saved!.companyName).toBe("Mobile QA BV");

    // And exactly two mails were enqueued for it, neither sent (no mail
    // provider is configured locally).
    const mails = await prisma.notificationOutbox.findMany({
      where: { dedupeKey: { contains: saved!.id } },
      orderBy: { kind: "asc" },
    });
    expect(mails.map((m) => m.kind)).toEqual(["diagnostic.received", "diagnostic.submitted"]);
    expect(mails.every((m) => m.status === "PENDING")).toBe(true);
    expect(mails.find((m) => m.kind === "diagnostic.received")!.recipient).toBe(email);

    // After the forced 500 the only console error permitted is the one it
    // caused. Anything else is a real fault the retry path introduced.
    const unexpected = errors.filter((e) => !/500 \(Internal Server Error\)/.test(e));
    expect(unexpected, `unexpected console errors:\n${unexpected.join("\n")}`).toEqual([]);

    await remove(email);
  });
});
