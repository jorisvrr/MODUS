import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { holdToSubmit } from "./holdToSubmit";

const TEST_EMAIL = "ada@playwright-qa.dev";
const OPTIONAL_FIELD_TEST_EMAIL = "grace@playwright-qa.dev";

async function clickFirstOptionNear(page: Page, headingText: string) {
  const heading = page.getByText(headingText, { exact: false }).first();
  await heading.locator("xpath=following-sibling::div[1]").locator("button").first().click();
}

/*
 * This flow submits a real row to the local development database, so it
 * is cleaned up afterwards — scoped tightly to these two distinctive
 * emails, never a broad delete.
 *
 * It used to shell out to `sqlite3 prisma/dev.db`, which has done
 * nothing since the move to Postgres: the file is gone, the command
 * failed, and the `catch` swallowed it. The rows therefore accumulated,
 * and because the API refuses a second submission from the same address
 * within 60 seconds, re-running this spec inside a minute put it on the
 * submit-error screen and the failure surfaced as "the estimate never
 * appeared" — nothing to do with the estimate.
 *
 * Cleaning up BEFORE each test as well as after means a leftover row
 * from an interrupted run cannot fail the next one.
 */
const prisma = new PrismaClient();
const TEST_EMAILS = [TEST_EMAIL, OPTIONAL_FIELD_TEST_EMAIL];

async function removeTestRows() {
  try {
    await prisma.diagnostic.deleteMany({ where: { email: { in: TEST_EMAILS } } });
  } catch {
    // The suite can run without a reachable database; the assertions
    // below will report that far more clearly than this hook would.
  }
}

test.beforeEach(removeTestRows);
test.afterEach(removeTestRows);
test.afterAll(async () => {
  await prisma.$disconnect();
});

test("full diagnostic happy path: intro -> review -> submit -> estimate", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => msg.type() === "error" && errors.push(msg.text()));
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/diagnostic");
  await page.getByRole("button", { name: /Start|Begin/i }).first().click();

  // Step 1: Business
  await page.getByLabel("Company name").fill("Playwright QA BV");
  await page.locator("select").first().selectOption({ index: 1 }); // industry
  await clickFirstOptionNear(page, "Employees");
  await clickFirstOptionNear(page, "Locations");
  await page.getByRole("button", { name: /^Continue$/ }).click();

  // Step 2: Operations
  await clickFirstOptionNear(page, "reach you");
  await page.getByRole("button", { name: /^Continue$/ }).click();

  // Step 3: Systems
  await clickFirstOptionNear(page, "runs your business");
  await clickFirstOptionNear(page, "connected are these systems");
  await page.getByRole("button", { name: /^Continue$/ }).click();

  // Step 4: Friction
  await clickFirstOptionNear(page, "harder than it should");
  await page
    .getByLabel(/In your own words/i)
    .fill("Enquiries arrive through email and WhatsApp and sometimes follow-up gets missed for days.");
  await page.getByRole("button", { name: /^Continue$/ }).click();

  // Step 5: Priorities
  await clickFirstOptionNear(page, "primarily interested in");
  await clickFirstOptionNear(page, "biggest difference");
  await clickFirstOptionNear(page, "ideally start");
  await page.getByRole("button", { name: /^Continue$/ }).click();

  // Step 6: Contact (last step, "Continue" becomes "Review")
  await page.getByLabel("First name").fill("Ada");
  await page.getByLabel("Last name").fill("Lovelace");
  await page.getByLabel("Work email").fill(TEST_EMAIL);
  await page.getByRole("button", { name: /Review/i }).click();

  await expect(page.getByText(/review/i).first()).toBeVisible({ timeout: 5000 });

  // Hold-to-confirm: press and hold for >1.1s rather than a simple click
  const submitBtn = page.getByRole("button", { name: /Hold to Submit/i });
  await holdToSubmit(page, submitBtn);

  await expect(page.getByText(/ESTIMATE|ENGAGEMENT/i).first()).toBeVisible({ timeout: 15000 });
  expect(errors, `console errors during diagnostic flow:\n${errors.join("\n")}`).toEqual([]);
});

test("the 'what goes wrong' free-text field is optional: submission succeeds when left blank", async ({ page }) => {
  await page.goto("/diagnostic");
  await page.getByRole("button", { name: /Start|Begin/i }).first().click();

  await page.getByLabel("Company name").fill("Optional Field QA BV");
  await page.locator("select").first().selectOption({ index: 1 });
  await clickFirstOptionNear(page, "Employees");
  await clickFirstOptionNear(page, "Locations");
  await page.getByRole("button", { name: /^Continue$/ }).click();

  await clickFirstOptionNear(page, "reach you");
  await page.getByRole("button", { name: /^Continue$/ }).click();

  await clickFirstOptionNear(page, "runs your business");
  await clickFirstOptionNear(page, "connected are these systems");
  await page.getByRole("button", { name: /^Continue$/ }).click();

  // Friction step: pick an area, but deliberately leave "In your own
  // words" blank — this is the field being made optional.
  await clickFirstOptionNear(page, "harder than it should");
  const descriptionField = page.getByLabel(/In your own words/i);
  await expect(descriptionField).toHaveValue("");
  // The field's own label should now read "Optional", not "Required".
  await expect(page.getByText(/In your own words/i).locator("..").getByText(/optional/i)).toBeVisible();
  const nextButton = page.getByRole("button", { name: /^Continue$/ });
  await expect(nextButton).toBeEnabled();
  await nextButton.click();

  await clickFirstOptionNear(page, "primarily interested in");
  await clickFirstOptionNear(page, "biggest difference");
  await clickFirstOptionNear(page, "ideally start");
  await page.getByRole("button", { name: /^Continue$/ }).click();

  await page.getByLabel("First name").fill("Grace");
  await page.getByLabel("Last name").fill("Hopper");
  await page.getByLabel("Work email").fill(OPTIONAL_FIELD_TEST_EMAIL);
  await page.getByRole("button", { name: /Review/i }).click();
  await expect(page.getByText(/review/i).first()).toBeVisible({ timeout: 5000 });

  const submitBtn = page.getByRole("button", { name: /Hold to Submit/i });
  await holdToSubmit(page, submitBtn);

  await expect(page.getByText(/ESTIMATE|ENGAGEMENT/i).first()).toBeVisible({ timeout: 15000 });
});
