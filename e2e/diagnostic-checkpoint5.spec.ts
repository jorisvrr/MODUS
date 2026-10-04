import { execSync } from "node:child_process";
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

/**
 * Checkpoint 5 — Diagnostic presentation/interaction redesign. These tests
 * cover what's new this checkpoint and isn't already exercised by
 * diagnostic.spec.ts's happy-path/optional-field coverage: the per-step
 * headline + minimal progress dots, the homepage entry-context hint
 * (Section 13), the submission-failure state (Section 19), and that the
 * diagnostic route's fluid field is disabled (Sections 14/22).
 */

const FAIL_TEST_EMAIL = "submit-fail@playwright-qa.dev";

test.afterEach(() => {
  const dbPath = path.join(__dirname, "..", "prisma", "dev.db");
  try {
    execSync(`sqlite3 "${dbPath}" "DELETE FROM Diagnostic WHERE email='${FAIL_TEST_EMAIL}';"`);
  } catch {
    // sqlite3 CLI or dev.db not present — nothing to clean up.
  }
});

test("progress dots and step headline advance and retreat correctly", async ({ page }) => {
  await page.goto("/diagnostic");
  await page.getByRole("button", { name: /Start|Begin/i }).first().click();

  await expect(page.getByText("01 / 06")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tell us about your business." })).toBeVisible();

  await page.getByLabel("Company name").fill("Progress QA BV");
  await page.locator("select").first().selectOption({ index: 1 });
  await clickFirstOptionNear(page, "Employees");
  await clickFirstOptionNear(page, "Locations");
  await page.getByRole("button", { name: /^Continue$/ }).click();

  await expect(page.getByText("02 / 06")).toBeVisible();
  await expect(page.getByRole("heading", { name: "How do customers reach you?" })).toBeVisible();

  await page.getByRole("button", { name: /^Back$/ }).click();
  await expect(page.getByText("01 / 06")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tell us about your business." })).toBeVisible();
  // Back-navigation shouldn't lose what was already filled in.
  await expect(page.getByLabel("Company name")).toHaveValue("Progress QA BV");
});

/**
 * Part 5 — what the homepage's "Start here" collects, and what happens to
 * it.
 *
 * The rules being asserted are the ones that make carrying it over safe:
 * it is shown back, it is editable, it is never silently an answer, it
 * never skips a required question, and it never travels in the URL.
 */
test("the homepage start context carries over, is editable, and is never an answer", async ({
  page,
}) => {
  await page.goto("/");
  const entryForm = page.locator("form").filter({ has: page.getByLabel(/What would you like to improve/i) });

  await entryForm.getByLabel(/What would you like to improve/i).fill("quotes take two days to go out");
  await entryForm.getByRole("button", { name: "Planning work", exact: true }).click();
  await entryForm.getByRole("button", { name: "Repetitive admin", exact: true }).click();

  // Multi-select, and the state is announced rather than only coloured.
  await expect(entryForm.getByRole("button", { name: "Planning work", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(entryForm.getByRole("button", { name: "Repetitive admin", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true"
  );

  // "Not sure yet" is exclusive in both directions.
  await entryForm.getByRole("button", { name: "Not sure yet", exact: true }).click();
  await expect(entryForm.getByRole("button", { name: "Planning work", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false"
  );
  await entryForm.getByRole("button", { name: "Planning work", exact: true }).click();
  await expect(entryForm.getByRole("button", { name: "Not sure yet", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false"
  );

  await entryForm.getByRole("link", { name: /Find my next step/i }).click();

  // The free text is NOT in the URL. It is the visitor's own description
  // of where their business is stuck; a URL is copied, pasted and logged.
  await expect(page).toHaveURL(/\/diagnostic$/);
  expect(page.url()).not.toContain("quotes");

  // It is shown back, and it is editable.
  await expect(page.getByText("You started with")).toBeVisible();
  const carried = page.getByLabel("What you would like to improve");
  await expect(carried).toHaveValue("quotes take two days to go out");
  await expect(page.getByRole("button", { name: /Planning work/ })).toBeVisible();

  // Starting still lands on an unanswered first step: nothing was
  // pre-filled and no required question was skipped.
  await page.getByRole("button", { name: /Start|Begin/i }).first().click();
  await expect(page.getByLabel("Company name")).toHaveValue("");
  await expect(page.getByText("01 / 06")).toBeVisible();
});

test("the carried text becomes an answer only when the visitor says so", async ({ page }) => {
  await page.goto("/");
  const entryForm = page.locator("form").filter({ has: page.getByLabel(/What would you like to improve/i) });
  await entryForm
    .getByLabel(/What would you like to improve/i)
    .fill("following up on quotes eats a whole morning every week");
  await entryForm.getByRole("link", { name: /Find my next step/i }).click();

  await page.getByRole("button", { name: /Start|Begin/i }).first().click();
  await page.getByLabel("Company name").fill("Carry QA BV");
  await page.locator("select").first().selectOption({ index: 1 });
  await clickFirstOptionNear(page, "Employees");
  await clickFirstOptionNear(page, "Locations");
  await page.getByRole("button", { name: /^Continue$/ }).click();
  await clickFirstOptionNear(page, "reach you");
  await page.getByRole("button", { name: /^Continue$/ }).click();
  await clickFirstOptionNear(page, "runs your business");
  await clickFirstOptionNear(page, "connected are these systems");
  await page.getByRole("button", { name: /^Continue$/ }).click();

  // The friction step asks the same question the homepage asked, so the
  // text is offered here — and the description field is still empty until
  // the offer is accepted.
  const description = page.getByLabel("In your own words, what happens?");
  await expect(description).toHaveValue("");
  await page.getByRole("button", { name: /Use this as my description/i }).click();
  await expect(description).toHaveValue("following up on quotes eats a whole morning every week");
  await expect(page.getByText("Added to the field below.")).toBeVisible();
});

test("clearing the carried context removes it rather than hiding it", async ({ page }) => {
  await page.goto("/");
  const entryForm = page.locator("form").filter({ has: page.getByLabel(/What would you like to improve/i) });
  await entryForm.getByRole("button", { name: "Getting more enquiries", exact: true }).click();
  await entryForm.getByRole("link", { name: /Find my next step/i }).click();

  await expect(page.getByText("You started with")).toBeVisible();
  await page.getByRole("button", { name: /^Clear this$/ }).click();
  await expect(page.getByText("You started with")).toHaveCount(0);

  // Gone from storage too, so a reload does not bring it back.
  await page.reload();
  await expect(page.getByText("You started with")).toHaveCount(0);
});

test("the CTA works with nothing entered at all", async ({ page }) => {
  // Both fields are optional. Someone who only knows that something is
  // wrong must not be stopped at the door.
  await page.goto("/");
  const entryForm = page.locator("form").filter({ has: page.getByLabel(/What would you like to improve/i) });
  await entryForm.getByRole("link", { name: /Find my next step/i }).click();
  await expect(page).toHaveURL(/\/diagnostic$/);
  await expect(page.getByText("You started with")).toHaveCount(0);
  await page.getByRole("button", { name: /Start|Begin/i }).first().click();
  await expect(page.getByText("01 / 06")).toBeVisible();
});

test("selecting a chip makes no request and saves nothing", async ({ page }) => {
  /*
   * MODUS's own endpoints only. Clerk's client library sends its own
   * background environment calls on load, which have nothing to do with a
   * chip being pressed — asserting on every non-GET request would be
   * asserting on Clerk's behaviour and would fail for a reason the test
   * does not care about.
   */
  const posts: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "GET") return;
    if (new URL(r.url()).host !== new URL(page.url() || "http://localhost").host) return;
    posts.push(`${r.method()} ${r.url()}`);
  });

  await page.goto("/");
  const entryForm = page.locator("form").filter({ has: page.getByLabel(/What would you like to improve/i) });
  await entryForm.getByRole("button", { name: "Planning work", exact: true }).click();
  await entryForm.getByLabel(/What would you like to improve/i).fill("typing without committing");
  await page.waitForTimeout(600);

  expect(posts, `a chip or a keystroke caused a request:\n${posts.join("\n")}`).toEqual([]);
  // And nothing was written: navigating to the diagnostic directly, without
  // pressing the CTA, carries nothing over.
  await page.goto("/diagnostic");
  await expect(page.getByText("You started with")).toHaveCount(0);
});

test("a failed submission shows a calm retry state, preserves answers, and a retry can then succeed", async ({
  page,
}) => {
  // Deterministic failure via network interception, rather than racing the
  // API's real 60s duplicate-email window (timing-dependent and flaky) —
  // this still exercises the real client-side failure path end to end
  // (submitDiagnostic sees `res.ok === false`, DiagnosticShell routes to
  // `submit_error`), it just controls the one external variable.
  let failNext = true;
  await page.route("**/api/diagnostic", async (route) => {
    if (failNext) {
      failNext = false;
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "fail" }) });
    } else {
      await route.continue();
    }
  });

  await page.goto("/diagnostic");
  await page.getByRole("button", { name: /Start|Begin/i }).first().click();

  await page.getByLabel("Company name").fill("Fail QA BV");
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
  await page.getByRole("button", { name: /^Continue$/ }).click();

  await clickFirstOptionNear(page, "primarily interested in");
  await clickFirstOptionNear(page, "biggest difference");
  await clickFirstOptionNear(page, "ideally start");
  await page.getByRole("button", { name: /^Continue$/ }).click();

  await page.getByLabel("First name").fill("Fail");
  await page.getByLabel("Last name").fill("Case");
  await page.getByLabel("Work email").fill(FAIL_TEST_EMAIL);

  await page.getByRole("button", { name: /Review/i }).click();
  await expect(page.getByText(/review/i).first()).toBeVisible({ timeout: 5000 });

  const submitBtn = page.getByRole("button", { name: /Hold to Submit/i });
  await holdToSubmit(page, submitBtn);

  await expect(page.getByText("That didn't go through.")).toBeVisible({ timeout: 10000 });

  // The answers are still intact underneath, not wiped.
  await page.getByRole("button", { name: /Back to review/i }).click();
  await expect(page.getByText("Fail QA BV", { exact: false }).first()).toBeVisible();

  // Retry — the interceptor now lets the real request through, so this
  // real submission should succeed.
  const retryBtn = page.getByRole("button", { name: /Hold to Submit/i });
  await holdToSubmit(page, retryBtn);
  await expect(page.getByText(/ESTIMATE|ENGAGEMENT/i).first()).toBeVisible({ timeout: 15000 });
});

/*
 * Rewritten for the Antimetal rebuild, which retired the site-wide WebGL
 * fluid field entirely (see MODUS_VISUAL_RESET_AUDIT.md). The invariant
 * the original test protected is still worth protecting and is unchanged
 * in substance: the Diagnostic stays free of decorative WebGL so attention
 * is on the question and the route stays light, while the homepage does
 * carry its one focal scene.
 *
 * What changed is only which component provides that scene — the hero
 * point cloud rather than the fluid field.
 */
test("diagnostic route mounts no WebGL below desktop; the homepage mounts the hero scene", async ({
  page,
}) => {
  // The diagnostic now has its own sphere -> layers -> stack scene on
  // desktop (>=1024px), which is a deliberate change: the entry screen's
  // main visual is that sphere.
  //
  // The property still worth protecting, and what this asserts, is that a
  // phone or small tablet gets a focused form with no WebGL context at
  // all — the scene is gated on the MOUNT, not merely hidden with CSS.
  await page.setViewportSize({ width: 900, height: 800 });
  await page.goto("/diagnostic");
  await page.waitForLoadState("networkidle");
  await expect(page.locator("canvas")).toHaveCount(0);

  await page.goto("/");
  await page.waitForLoadState("networkidle");
  // Scoped to the hero rather than counting canvases page-wide: the
  // homepage legitimately has a second scene further down (the
  // architecture stack), which builds lazily as it is approached. A
  // page-wide count would make this test fail for the wrong reason the
  // moment that lazy threshold is retuned.
  const hero = page.locator("section").first();
  await expect(hero.locator("canvas")).toHaveCount(1, { timeout: 5000 });
});
