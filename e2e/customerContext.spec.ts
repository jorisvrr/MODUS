import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { requireLocalMutableEnvironment } from "./localOnlyGuard";
import { holdToSubmit } from "./holdToSubmit";
import { clickFirstOptionNear } from "./diagnosticForm";

/*
 * These tests write real rows to the database, so they refuse to run
 * unless the environment is unmistakably local development.
 */
requireLocalMutableEnvironment();

// Unique per test (not a shared constant): /api/diagnostic rejects a second
// submission from the same email within 60s as a likely duplicate, which
// would make these tests fail each other when Playwright runs them in
// parallel workers rather than a real product bug. Must be a pure function
// of testId alone — it's called independently in the test body and in
// afterEach, and both need to land on the exact same address.
function testEmail(testId: string) {
  const unique = createHash("sha1").update(testId).digest("hex").slice(0, 16);
  return `cc.playwright.${unique}@example.com`;
}

test.afterEach(async ({}, testInfo) => {
  const dbPath = path.join(__dirname, "..", "prisma", "dev.db");
  const email = testEmail(testInfo.testId);
  try {
    execSync(`sqlite3 "${dbPath}" "DELETE FROM Diagnostic WHERE email='${email}';"`);
  } catch {
    // sqlite3 CLI or dev.db not present — nothing to clean up.
  }
});

async function completeDiagnostic(page: Page, email: string) {
  await page.goto("/diagnostic");
  await page.getByRole("button", { name: /Start|Begin/i }).first().click();

  await page.getByLabel("Company name").fill("Customer Context QA BV");
  await page.locator("select").first().selectOption({ index: 1 });
  await clickFirstOptionNear(page, "Employees");
  await clickFirstOptionNear(page, "Locations");
  await page.getByRole("button", { name: /^Continue$/ }).click();

  await clickFirstOptionNear(page, "reach you");
  await page.getByRole("button", { name: /^Continue$/ }).click();

  await clickFirstOptionNear(page, "runs your business");
  await clickFirstOptionNear(page, "connected are these systems");
  await page.getByRole("button", { name: /^Continue$/ }).click();

  await clickFirstOptionNear(page, "harder than it should");
  await page
    .getByLabel(/In your own words/i)
    .fill("Enquiries arrive through email and WhatsApp and sometimes follow-up gets missed for days.");
  await page.getByRole("button", { name: /^Continue$/ }).click();

  await clickFirstOptionNear(page, "primarily interested in");
  await clickFirstOptionNear(page, "biggest difference");
  await clickFirstOptionNear(page, "ideally start");
  await page.getByRole("button", { name: /^Continue$/ }).click();

  await page.getByLabel("First name").fill("Context");
  await page.getByLabel("Last name").fill("QA");
  await page.getByLabel("Work email").fill(email);
  await page.getByRole("button", { name: /Review/i }).click();

  await expect(page.getByText(/review/i).first()).toBeVisible({ timeout: 5000 });

  const submitBtn = page.getByRole("button", { name: /Hold to Submit/i });
  await holdToSubmit(page, submitBtn);

  await expect(page.getByText(/ESTIMATE|ENGAGEMENT/i).first()).toBeVisible({ timeout: 15000 });
  // The context reference is saved as soon as the API responds, independent
  // of the (timer-driven) screen transition — give it a beat to land.
  await page.waitForTimeout(300);
}

test.describe("customer context", () => {
  test("FLOW A: anonymous -> starts diagnostic -> leaves -> returns -> nav CTA becomes Continue Diagnostic", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.locator("header").getByRole("link", { name: "Run a Diagnostic" })
    ).toBeVisible();

    await page.goto("/diagnostic");
    await page.getByRole("button", { name: /Start|Begin/i }).first().click();
    await page.getByLabel("Company name").fill("Half Finished BV");

    // Leave without finishing (sessionStorage draft is saved on the form screen)
    await page.goto("/");

    await expect(page.getByRole("link", { name: "Continue Diagnostic" }).first()).toBeVisible();
  });

  test("FLOW B/C: completed diagnostic -> homepage and pricing show the personalized profile", async ({ page }, testInfo) => {
    await completeDiagnostic(page, testEmail(testInfo.testId));

    // Simulate "returns later": a fresh navigation, not just in-memory state
    await page.goto("/");
    await expect(page.getByRole("link", { name: "View Your Profile" }).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/CUSTOMER CONTEXT QA BV/i)).toBeVisible();

    await page.goto("/pricing");
    await expect(page.getByText(/CUSTOMER CONTEXT QA BV \/ INITIAL ESTIMATE/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("heading", { level: 1 })).toContainText("€");
    await expect(page.getByRole("button", { name: "Review This Estimate With MODUS" })).toBeVisible();
  });

  test("FLOW E: starting a new diagnostic from the profile-ready screen clears context and restores the generic site", async ({
    page,
  }, testInfo) => {
    await completeDiagnostic(page, testEmail(testInfo.testId));
    await page.goto("/diagnostic");

    await expect(page.getByText(/PROFILE READY/i)).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: /Start a new diagnostic/i }).click();

    // Back to the generic intro screen
    await expect(page.getByRole("button", { name: /Begin Diagnostic/i })).toBeVisible();

    await page.goto("/");
    await expect(
      page.locator("header").getByRole("link", { name: "Run a Diagnostic" })
    ).toBeVisible();
  });

  test("no console errors across the personalized homepage and pricing views", async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("console", (msg) => msg.type() === "error" && errors.push(msg.text()));
    page.on("pageerror", (err) => errors.push(err.message));

    await completeDiagnostic(page, testEmail(testInfo.testId));
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.goto("/pricing");
    await page.waitForLoadState("networkidle");

    expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
  });
});
