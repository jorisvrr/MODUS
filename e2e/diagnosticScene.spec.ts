import { test, expect, type Locator, type Page } from "@playwright/test";
import { requireLocalMutableEnvironment } from "./localOnlyGuard";
import { holdToSubmit } from "./holdToSubmit";
import { clickFirstOptionNear } from "./diagnosticForm";

/*
 * These tests write real rows to the database, so they refuse to run
 * unless the environment is unmistakably local development.
 */
requireLocalMutableEnvironment();

/**
 * The diagnostic's composition and the explanation beside it, verified
 * through the real journey rather than through the geometry module's unit
 * tests.
 *
 * The unit tests assert the geometry and the state mapping: given a screen,
 * a step and which topics are answered, where the points go. They cannot
 * see whether the thing is mounted on that screen, whether the explanation
 * actually explains anything, whether it sits on top of a question, or
 * whether it still says the right thing with `prefers-reduced-motion` set.
 * Each of those has been wrong at some point, so each is asserted here
 * against the running app.
 */

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const SHOTS = "e2e-screens";

/**
 * Screenshot after the stage transition has settled. The point cloud eases
 * toward its new targets and the copy cross-fades, so a capture taken the
 * moment an assertion passes shows it mid-morph and is not representative
 * of what a visitor sees.
 */
async function shot(page: Page, name: string, scroll: "top" | "bottom" = "top") {
  await page.evaluate(
    (to) => window.scrollTo(0, to === "top" ? 0 : document.body.scrollHeight),
    scroll
  );
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

/** The scene's canvas. The diagnostic route has no other canvas. */
function scene(page: Page) {
  return page.locator("canvas");
}

/**
 * The canvas is decorative and sits behind the content, but the page has no
 * opaque background — so points drawn under a paragraph show through it.
 * "Behind" is not sufficient; it must not be over the content at all.
 */
async function expectClearOf(
  page: Page,
  what: Locator,
  label: string,
  // A block-level heading or paragraph fills its container's width even
  // when its text does not, so its border box is not where the reader's
  // eye is. For those, measure the rendered glyphs instead. Interactive
  // controls keep their border box: overlapping a button's padding is a
  // real collision even where no glyph sits.
  mode: "box" | "text" = "box"
) {
  const a = await scene(page).first().boundingBox();
  const b =
    mode === "box"
      ? await what.boundingBox()
      : await what.evaluate((el) => {
          const range = document.createRange();
          range.selectNodeContents(el);
          const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
          if (!rects.length) return null;
          const left = Math.min(...rects.map((r) => r.left));
          const top = Math.min(...rects.map((r) => r.top));
          return {
            x: left,
            y: top,
            width: Math.max(...rects.map((r) => r.right)) - left,
            height: Math.max(...rects.map((r) => r.bottom)) - top,
          };
        });
  expect(a, "scene canvas should be present").not.toBeNull();
  expect(b, `${label} should be present`).not.toBeNull();
  const disjoint =
    a!.x + a!.width <= b!.x ||
    b!.x + b!.width <= a!.x ||
    a!.y + a!.height <= b!.y ||
    b!.y + b!.height <= a!.y;
  expect(
    disjoint,
    `the scene overlaps ${label}: scene=${JSON.stringify(a)} ${label}=${JSON.stringify(b)}`
  ).toBe(true);
}

/**
 * Everything the brief required to be gone, asserted as absent rather than
 * assumed gone.
 *
 * The node-map card, its pill menu, the "preliminary signals" section that
 * passed judgement on a half-finished answer set, and the placeholder
 * sentences that stood in for facts that did not exist yet.
 */
async function expectRetiredSurfacesGone(page: Page) {
  await expect(page.getByText(/INITIAL PROFILE/i)).toHaveCount(0);
  for (const pill of ["OPERATIONS", "AUTOMATION", "REVENUE", "DATA"]) {
    await expect(page.getByText(pill, { exact: true })).toHaveCount(0);
  }
  await expect(page.getByText(/Preliminary Signals/i)).toHaveCount(0);
  await expect(page.getByText(/watching for signals/i)).toHaveCount(0);
  await expect(page.getByText(/profile will build here/i)).toHaveCount(0);
  // The six projected topic labels, which lined up into a floating menu.
  await expect(page.locator("[data-layer]")).toHaveCount(0);
}

async function fillStep1(page: Page, company: string) {
  await page.getByLabel("Company name").fill(company);
  await page.locator("select").first().selectOption({ index: 1 });
  await clickFirstOptionNear(page, "Employees");
  await clickFirstOptionNear(page, "Locations");
}

/**
 * Walks forward from wherever the form is to the review screen WITHOUT
 * touching any answer.
 *
 * Used after an EDIT detour. Re-running `answerThroughPriorities` there
 * would re-click options that are already selected, which toggles them
 * OFF and leaves the step incomplete — the forward button then stays
 * disabled, which is correct behaviour and a broken test.
 */
async function advanceToReview(page: Page) {
  for (let i = 0; i < 8; i++) {
    const review = page.getByRole("button", { name: /^Review$/ });
    if (await review.count()) {
      await review.click();
      return;
    }
    await page.getByRole("button", { name: /^Continue$/ }).click();
  }
  throw new Error("never reached the review screen");
}

/** Steps 2..5, leaving the contact step open. */
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

test.describe("the composition through the real journey", () => {
  test.use({ viewport: DESKTOP });
  // These walk the whole six-step flow and pause for each stage to settle
  // before capturing it, which does not fit the default per-test budget.
  test.setTimeout(120_000);

  test("every stage explains itself, renders, and stays clear of the content", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });

    // --- entry --------------------------------------------------------
    await page.goto("/diagnostic");
    await expect(scene(page)).toHaveCount(1);
    // The claim the whole graphic rests on: it says why the questions are
    // being asked. Not just that it rendered.
    await expect(page.getByText("Why we ask")).toBeVisible();
    await expect(page.getByText("Six topics make one picture.")).toBeVisible();
    await expectClearOf(page, page.getByRole("heading").first(), "the entry heading", "text");
    await expectRetiredSurfacesGone(page);
    await shot(page, "01-entry");

    /*
     * Tag the live canvas so the stage changes below can prove it is the
     * SAME element throughout. The whole sequence is one cloud with
     * persistent point identities — the same point that sits in the
     * opening cloud is drawn into a topic's wedge and then into the mark.
     * A remount would silently reset every position and lose the WebGL
     * context, and the stages would read as unrelated illustrations rather
     * than one object being organised. Nothing else in the suite would
     * notice.
     */
    await scene(page).first().evaluate((el) => {
      (el as HTMLCanvasElement & { __sceneId?: string }).__sceneId = "entry-cloud";
    });
    const sameCanvas = () =>
      scene(page)
        .first()
        .evaluate((el) => (el as HTMLCanvasElement & { __sceneId?: string }).__sceneId === "entry-cloud");

    // --- answering ----------------------------------------------------
    await page.getByRole("button", { name: /Start|Begin/i }).first().click();
    await expect(page.getByText("01 / 06")).toBeVisible();
    await expect(scene(page)).toHaveCount(1);
    // The explanation is per-step, and it is the current step's.
    await expect(page.getByText(/Size, sector and locations set what counts as normal/i)).toBeVisible();
    // Nothing is summarised before anything is answered — and no
    // placeholder stands in for the facts that do not exist yet.
    await expect(page.getByText(/Recorded so far/i)).toHaveCount(0);
    await expectClearOf(page, page.getByLabel("Company name"), "the company-name field");
    await expectClearOf(
      page,
      page.getByRole("heading", { name: /Tell us about your business/i }),
      "the question heading",
      "text"
    );
    await expectRetiredSurfacesGone(page);
    expect(await sameCanvas(), "the scene remounted between the entry cloud and the first topic").toBe(true);
    await shot(page, "02-form-step1-nothing-recorded");

    // Answering is what makes a summary appear, and it is the real answer.
    await fillStep1(page, "Scene QA BV");
    const industry = await page.locator("select").first().inputValue();
    await expect(page.getByText(/Recorded so far/i)).toBeVisible();
    await expect(page.getByText("1 of 6 topics recorded")).toBeVisible();
    await expect(page.getByText("Scene QA BV", { exact: true })).toBeVisible();
    await expect(page.getByText(industry, { exact: true }).first()).toBeVisible();
    await shot(page, "03-form-step1-recorded");

    // The explanation follows the real step.
    await page.getByRole("button", { name: /^Continue$/ }).click();
    await expect(page.getByText("02 / 06")).toBeVisible();
    await expect(page.getByText(/How work arrives, and how much of it is moved by hand/i)).toBeVisible();
    await expect(page.getByText(/Size, sector and locations/i)).toHaveCount(0);
    // What was already recorded stays recorded.
    await expect(page.getByText("Scene QA BV", { exact: true })).toBeVisible();
    await shot(page, "04-form-step2");

    // Back navigation resolves to the earlier topic and does NOT un-record
    // what was answered.
    await page.getByRole("button", { name: /^Back$/ }).click();
    await expect(page.getByText("01 / 06")).toBeVisible();
    await expect(page.getByText(/Size, sector and locations/i)).toBeVisible();
    await expect(page.getByText("1 of 6 topics recorded")).toBeVisible();
    await expect(page.getByLabel("Company name")).toHaveValue("Scene QA BV");

    // --- review -------------------------------------------------------
    await answerThroughPriorities(page);
    await page.getByLabel("First name").fill("Scene");
    await page.getByLabel("Last name").fill("QA");
    await page.getByLabel("Work email").fill(`scene-${Date.now()}@playwright-qa.dev`);
    await expect(page.getByText("6 of 6 topics recorded")).toBeVisible();
    await page.getByRole("button", { name: /Review/i }).click();
    await expect(page.getByText(/review/i).first()).toBeVisible({ timeout: 5000 });

    await expect(scene(page)).toHaveCount(1);
    // The three groups the brief asked for, by name.
    for (const group of ["Your work", "What gets in the way", "What matters first"]) {
      await expect(page.getByText(group, { exact: true })).toBeVisible();
    }
    const submitBtn = page.getByRole("button", { name: /Hold to Submit/i });
    await expectClearOf(page, submitBtn, "the submit button");
    await expectClearOf(
      page,
      page.getByRole("heading", { name: /Review your business profile/i }),
      "the review heading",
      "text"
    );
    /*
     * Every row's EDIT control, not just one. These sit at the right-hand
     * end of the review column — the edge nearest the scene — so they are
     * what a mispositioned gutter would collide with first.
     */
    const editControls = page.getByRole("button", { name: /^edit$/i });
    const editCount = await editControls.count();
    expect(editCount, "the review screen should offer per-row EDIT controls").toBeGreaterThan(0);
    for (let i = 0; i < editCount; i++) {
      await expectClearOf(page, editControls.nth(i), `EDIT control ${i + 1} of ${editCount}`);
    }
    // Nothing claims a save has happened.
    await expect(page.getByText(/stored with MODUS/i)).toHaveCount(0);
    expect(await sameCanvas(), "the scene remounted between the topics and the review groups").toBe(true);
    await shot(page, "05-review-three-groups");

    // --- EDIT from review feeds back into the summary ------------------
    await editControls.first().click();
    await expect(page.getByText("01 / 06")).toBeVisible();
    await page.getByLabel("Company name").fill("Edited QA BV");
    await expect(page.getByText("Edited QA BV", { exact: true })).toBeVisible();
    await expect(page.getByText("Scene QA BV", { exact: true })).toHaveCount(0);
    await shot(page, "06-edit-updates-summary");

    // --- closure: only after the server acknowledges -------------------
    await advanceToReview(page);
    await expect(page.getByText(/review/i).first()).toBeVisible({ timeout: 5000 });
    await holdToSubmit(page, page.getByRole("button", { name: /Hold to Submit/i }));
    await expect(page.getByText(/ESTIMATE|ENGAGEMENT/i).first()).toBeVisible({ timeout: 15000 });
    await expect(scene(page)).toHaveCount(1);
    await expectClearOf(page, page.getByRole("heading").first(), "the estimate heading", "text");
    expect(await sameCanvas(), "the scene remounted between the review groups and the closure").toBe(true);
    await shot(page, "07-result-closure");

    // --- profile: the closure as the screen's subject, with its wording -
    await page.goto("/diagnostic");
    await expect(page.getByText(/PROFILE READY/i)).toBeVisible({ timeout: 10000 });
    await expect(scene(page)).toHaveCount(1);
    await expect(page.getByText(/Your answers are stored with MODUS/i)).toBeVisible();
    await expectClearOf(page, page.getByRole("heading").first(), "the profile heading", "text");
    await expectClearOf(
      page,
      page.getByRole("button", { name: /Start a new diagnostic/i }),
      "the start-new control"
    );
    await shot(page, "08-profile-closure");

    expect(errors, `console errors across the journey:\n${errors.join("\n")}`).toEqual([]);
  });

  test("a failed submission holds the review grouping and never claims a save", async ({ page }) => {
    // The one thing the composition must never do is anticipate success.
    await page.route("**/api/diagnostic", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "fail" }) })
    );

    await page.goto("/diagnostic");
    await page.getByRole("button", { name: /Start|Begin/i }).first().click();
    await fillStep1(page, "Scene Fail BV");
    await answerThroughPriorities(page);
    await page.getByLabel("First name").fill("Scene");
    await page.getByLabel("Last name").fill("Fail");
    await page.getByLabel("Work email").fill(`scene-fail-${Date.now()}@playwright-qa.dev`);
    await page.getByRole("button", { name: /Review/i }).click();
    await expect(page.getByText(/review/i).first()).toBeVisible({ timeout: 5000 });

    await holdToSubmit(page, page.getByRole("button", { name: /Hold to Submit/i }));
    await expect(page.getByText("That didn't go through.")).toBeVisible({ timeout: 10000 });

    // Still mounted, still the review grouping, and crucially neither the
    // estimate nor the "stored with MODUS" wording was ever reached.
    await expect(scene(page)).toHaveCount(1);
    await expect(page.getByText("Your work", { exact: true })).toBeVisible();
    await expect(page.getByText(/stored with MODUS/i)).toHaveCount(0);
    await expect(page.getByText(/ESTIMATE|ENGAGEMENT/i)).toHaveCount(0);
    await expectClearOf(page, page.getByText("That didn't go through."), "the failure message", "text");
    await shot(page, "09-submit-error");

    // A retry that succeeds is what finally produces the closure wording.
    await page.unroute("**/api/diagnostic");
    await page.getByRole("button", { name: /Back to review/i }).click();
    await holdToSubmit(page, page.getByRole("button", { name: /Hold to Submit/i }));
    await expect(page.getByText(/ESTIMATE|ENGAGEMENT/i).first()).toBeVisible({ timeout: 15000 });
    await shot(page, "10-retry-succeeded");
  });

  test("reduced motion shows the SAME information, it just does not animate it", async ({ page }) => {
    // The regression this guards: with no frame loop running, a stage
    // change had nothing to pick it up, so the scene stayed frozen on
    // whatever composition it mounted with.
    await page.emulateMedia({ reducedMotion: "reduce" });

    await page.goto("/diagnostic");
    await expect(scene(page)).toHaveCount(1);
    await expect(page.getByText("Six topics make one picture.")).toBeVisible();
    await shot(page, "11-reduced-entry");

    await page.getByRole("button", { name: /Start|Begin/i }).first().click();
    await expect(page.getByText("01 / 06")).toBeVisible();
    await expect(page.getByText(/Size, sector and locations/i)).toBeVisible();
    await fillStep1(page, "Reduced Motion BV");
    // The summary is not an animation, so it is here too.
    await expect(page.getByText("1 of 6 topics recorded")).toBeVisible();
    await expect(page.getByText("Reduced Motion BV", { exact: true })).toBeVisible();
    await shot(page, "12-reduced-form");

    await page.getByRole("button", { name: /^Continue$/ }).click();
    await expect(page.getByText("02 / 06")).toBeVisible();
    await expect(page.getByText(/How work arrives/i)).toBeVisible();
    await shot(page, "13-reduced-form-step2");
  });

  test("on a phone the explanation is text only, with no WebGL context at all", async ({ page }) => {
    // Not merely hidden with CSS: a hidden canvas still holds a WebGL
    // context and still costs GPU memory. The words are what a narrow
    // screen should spend its room on, and they must actually be there.
    await page.setViewportSize(PHONE);

    await page.goto("/diagnostic");
    await expect(scene(page)).toHaveCount(0);
    await expect(page.getByText("Six topics make one picture.")).toBeVisible();
    await shot(page, "14-phone-entry");

    await page.getByRole("button", { name: /Start|Begin/i }).first().click();
    await expect(page.getByText("01 / 06")).toBeVisible();
    await expect(scene(page)).toHaveCount(0);
    await expect(page.getByText(/Size, sector and locations/i)).toBeVisible();
    await fillStep1(page, "Phone QA BV");
    await expect(page.getByText("1 of 6 topics recorded")).toBeVisible();
    await shot(page, "15-phone-form");

    await answerThroughPriorities(page);
    await page.getByLabel("First name").fill("Phone");
    await page.getByLabel("Last name").fill("QA");
    await page.getByLabel("Work email").fill(`phone-${Date.now()}@playwright-qa.dev`);
    await page.getByRole("button", { name: /Review/i }).click();
    await expect(page.getByText(/review/i).first()).toBeVisible({ timeout: 5000 });
    // The grouping is the framing for this screen, so it is not
    // desktop-only.
    for (const group of ["Your work", "What gets in the way", "What matters first"]) {
      await expect(page.getByText(group, { exact: true })).toBeVisible();
    }
    await expect(scene(page)).toHaveCount(0);
    await shot(page, "16-phone-review");

    await holdToSubmit(page, page.getByRole("button", { name: /Hold to Submit/i }));
    await expect(page.getByText(/ESTIMATE|ENGAGEMENT/i).first()).toBeVisible({ timeout: 15000 });
    await shot(page, "17-phone-result");
  });

  test("below the layout's threshold the canvas is not mounted", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await page.goto("/diagnostic");
    await page.waitForLoadState("networkidle");
    await expect(scene(page)).toHaveCount(0);

    await page.getByRole("button", { name: /Start|Begin/i }).first().click();
    await expect(page.getByText("01 / 06")).toBeVisible();
    await expect(scene(page)).toHaveCount(0);

    // The review-family screens need a wider gutter than 1024px, so at
    // 1100 the entry composition mounts but the review one does not.
    await page.setViewportSize({ width: 1100, height: 800 });
    await page.goto("/diagnostic");
    await expect(scene(page)).toHaveCount(1);
  });
});

/**
 * Captures at the widths where the documented thresholds change what is
 * shown, and asserts the thresholds rather than only photographing them.
 *
 * 1024 — the entry and answering compositions mount; the review and result
 * ones do not, because those layouts' only free space is the page gutter
 * and it is not wide enough until 1280.
 * 1280 — everything mounts.
 * 1440 — the reference width the placements were measured at.
 */
for (const width of [1024, 1280, 1440]) {
  test(`placement and thresholds at ${width}px`, async ({ page }) => {
    test.setTimeout(120_000);
    const gutterStages = width >= 1280;
    await page.setViewportSize({ width, height: 900 });

    await page.goto("/diagnostic");
    await expect(scene(page)).toHaveCount(1);
    await shot(page, `w${width}-1-entry`);

    await page.getByRole("button", { name: /Start|Begin/i }).first().click();
    await expect(page.getByText("01 / 06")).toBeVisible();
    await expect(scene(page)).toHaveCount(1);
    await fillStep1(page, `Width ${width} BV`);
    await expectClearOf(page, page.getByLabel("Company name"), "the company-name field");
    await shot(page, `w${width}-2-form`);

    await answerThroughPriorities(page);
    await page.getByLabel("First name").fill("Width");
    await page.getByLabel("Last name").fill("QA");
    await page.getByLabel("Work email").fill(`w${width}-${Date.now()}@playwright-qa.dev`);
    await page.getByRole("button", { name: /Review/i }).click();
    await expect(page.getByText(/review/i).first()).toBeVisible({ timeout: 5000 });
    await expect(scene(page)).toHaveCount(gutterStages ? 1 : 0);
    // Either way the three groups are readable at this width.
    await expect(page.getByText("Your work", { exact: true })).toBeVisible();
    const submitBtn = page.getByRole("button", { name: /Hold to Submit/i });
    if (gutterStages) {
      await expectClearOf(page, submitBtn, "the submit button");
      const edits = page.getByRole("button", { name: /^edit$/i });
      for (let i = 0; i < (await edits.count()); i++) {
        await expectClearOf(page, edits.nth(i), `EDIT control ${i + 1} at ${width}px`);
      }
    }
    await shot(page, `w${width}-3-review`);

    await holdToSubmit(page, submitBtn);
    await expect(page.getByText(/ESTIMATE|ENGAGEMENT/i).first()).toBeVisible({ timeout: 15000 });
    await expect(scene(page)).toHaveCount(gutterStages ? 1 : 0);
    await shot(page, `w${width}-4-result`);

    await page.goto("/diagnostic");
    await expect(page.getByText(/PROFILE READY/i)).toBeVisible({ timeout: 10000 });
    // The profile closure needs only the two-column layout, so it appears
    // at 1024 as well.
    await expect(scene(page)).toHaveCount(1);
    await shot(page, `w${width}-5-profile`);
  });
}
