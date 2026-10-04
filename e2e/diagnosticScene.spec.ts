import { test, expect, type Locator, type Page } from "@playwright/test";
import { requireLocalMutableEnvironment } from "./localOnlyGuard";
import { holdToSubmit } from "./holdToSubmit";

/*
 * These tests write real rows to the database, so they refuse to run
 * unless the environment is unmistakably local development.
 */
requireLocalMutableEnvironment();

/**
 * The diagnostic's sphere -> layers -> stack -> closure graphic, verified
 * through the real journey rather than through the geometry module's unit
 * tests.
 *
 * The unit tests assert the state mapping only: given a screen and a step,
 * which stage. They cannot see whether the scene is mounted on that
 * screen, whether it renders, whether it sits on top of a question, or
 * whether it updates at all when `prefers-reduced-motion` is set. Each of
 * those has been wrong at some point, so each is asserted here against the
 * running app.
 */

const DESKTOP = { width: 1440, height: 900 };
const SHOTS = "e2e-screens";

async function clickFirstOptionNear(page: Page, headingText: string) {
  const heading = page.getByText(headingText, { exact: false }).first();
  await heading.locator("xpath=following-sibling::div[1]").locator("button").first().click();
}

/**
 * Screenshot after the stage transition has settled. The topic labels
 * carry a 300ms CSS opacity transition and the point cloud eases toward
 * its new targets, so a capture taken the moment an assertion passes
 * shows the scene mid-morph and is not representative of what a visitor
 * sees.
 */
async function shot(page: Page, name: string, scroll: "top" | "bottom" = "top") {
  // Filling and clicking fields scrolls them into view, so by the end of a
  // step the page is left part-way down and a capture taken there is not
  // what a visitor arriving on the screen sees. Park the page explicitly.
  await page.evaluate((to) => window.scrollTo(0, to === "top" ? 0 : document.body.scrollHeight), scroll);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

/** The scene's canvas. The form screens have no other canvas. */
function scene(page: Page) {
  return page.locator("canvas");
}

/**
 * The scene is decorative and sits behind the content, but the page has no
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
 * The old "MODUS / Initial Profile" node-map card must be gone, not
 * merely moved.
 *
 * This replaces a clearance check between the scene and that panel. Once
 * the panel was removed, its locator (`div.rounded-md.border`) still
 * matched one unrelated element, so the check kept passing while
 * asserting nothing about anything. Asserting its absence is the claim
 * that actually matters now.
 */
async function expectNodeMapGone(page: Page) {
  await expect(page.getByText(/INITIAL PROFILE/i)).toHaveCount(0);
  // The node map's own pill labels, which were a separate vertical menu.
  for (const pill of ["OPERATIONS", "AUTOMATION", "REVENUE", "DATA"]) {
    await expect(page.getByText(pill, { exact: true })).toHaveCount(0);
  }
}

/** Inline opacity of a projected topic label, written by the render path. */
async function labelOpacity(page: Page, layer: number): Promise<number> {
  return Number(
    await page.locator(`[data-layer="${layer}"]`).evaluate((el) => (el as HTMLElement).style.opacity || "0")
  );
}

async function fillStep1(page: Page, company: string) {
  await page.getByLabel("Company name").fill(company);
  await page.locator("select").first().selectOption({ index: 1 });
  await clickFirstOptionNear(page, "Employees");
  await clickFirstOptionNear(page, "Locations");
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

test.describe("diagnostic scene through the real journey", () => {
  test.use({ viewport: DESKTOP });
  // These walk the whole six-step flow and pause for each stage to settle
  // before capturing it, which does not fit the default per-test budget.
  test.setTimeout(90_000);

  test("every stage mounts, renders, and stays clear of the content", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });

    // --- entry: the sphere -------------------------------------------
    await page.goto("/diagnostic");
    await expect(scene(page)).toHaveCount(1);
    await expectClearOf(page, page.getByRole("heading").first(), "the entry heading", "text");
    // Naming topics at entry would imply progress that has not happened.
    expect(await labelOpacity(page, 0)).toBe(0);
    await shot(page, "01-entry-sphere");

    /*
     * Tag the live canvas so the stage changes below can prove it is the
     * SAME element throughout. The whole sequence is built on one cloud
     * with persistent point identities — the same point that sits on the
     * entry sphere becomes a point in a topic layer and then a point in
     * the mark. A remount would silently reset every position to the
     * sphere and lose the WebGL context, and the four stages would read
     * as four unrelated illustrations rather than one object being
     * reorganised. Nothing else in the suite would notice.
     */
    await scene(page).first().evaluate((el) => {
      (el as HTMLCanvasElement & { __sceneId?: string }).__sceneId = "entry-cloud";
    });
    const sameCanvas = () =>
      scene(page)
        .first()
        .evaluate((el) => (el as HTMLCanvasElement & { __sceneId?: string }).__sceneId === "entry-cloud");

    // --- answering: separated layers, active topic emphasised --------
    await page.getByRole("button", { name: /Start|Begin/i }).first().click();
    await expect(page.getByText("01 / 06")).toBeVisible();
    await expect(scene(page)).toHaveCount(1);
    // The scene must not cover the question or the controls.
    await expectClearOf(page, page.getByLabel("Company name"), "the company-name field");
    await expectClearOf(
      page,
      page.getByRole("heading", { name: /Tell us about your business/i }),
      "the question heading",
      "text"
    );
    // The first topic reads as active; a later one is present but quiet.
    await expect.poll(() => labelOpacity(page, 0), { timeout: 4000 }).toBe(1);
    expect(await labelOpacity(page, 3)).toBeLessThan(1);
    // One composition, not the scene plus the old card.
    await expectNodeMapGone(page);
    await expect(page.locator("canvas")).toHaveCount(1);
    // The layers are pinned below the sticky panel and must stay clear of
    // it wherever the page is scrolled.
    expect(await sameCanvas(), "the scene remounted between the entry sphere into the topic layers").toBe(true);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    await page.evaluate(() => window.scrollTo(0, Math.round(document.body.scrollHeight / 2)));
    await page.waitForTimeout(500);
    await shot(page, "02-layers-step1");

    // The active layer tracks the real step, not a decorative counter.
    await fillStep1(page, "Scene QA BV");
    await page.getByRole("button", { name: /^Continue$/ }).click();
    await expect(page.getByText("02 / 06")).toBeVisible();
    await expect.poll(() => labelOpacity(page, 1), { timeout: 4000 }).toBe(1);
    expect(await labelOpacity(page, 0)).toBeLessThan(1);
    // The panel grows as answers accumulate, so the band is re-measured
    // per step rather than sampled once.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    await shot(page, "03-layers-step2");
    // The layers sit beneath the `sticky` ProfilePanel, in the lower part
    // of the right column, so this is where they are seen in full.
    await shot(page, "03b-layers-scrolled", "bottom");

    // Back navigation resolves to the earlier layer rather than queueing.
    await page.getByRole("button", { name: /^Back$/ }).click();
    await expect(page.getByText("01 / 06")).toBeVisible();
    await expect.poll(() => labelOpacity(page, 0), { timeout: 4000 }).toBe(1);

    // --- review: the composed stack ----------------------------------
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
    await page.getByLabel("First name").fill("Scene");
    await page.getByLabel("Last name").fill("QA");
    await page.getByLabel("Work email").fill(`scene-${Date.now()}@playwright-qa.dev`);
    await page.getByRole("button", { name: /Review/i }).click();
    await expect(page.getByText(/review/i).first()).toBeVisible({ timeout: 5000 });

    await expect(scene(page)).toHaveCount(1);
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
     * what a mispositioned gutter would collide with first. Asserting
     * each of them is what caught the column being full-width.
     */
    const editControls = page.getByRole("button", { name: /^edit$/i });
    const editCount = await editControls.count();
    expect(editCount, "the review screen should offer per-row EDIT controls").toBeGreaterThan(0);
    for (let i = 0; i < editCount; i++) {
      await expectClearOf(page, editControls.nth(i), `EDIT control ${i + 1} of ${editCount}`);
    }
    // Topic labels belong to the question stages; the stack is unlabelled.
    await expect.poll(() => labelOpacity(page, 0), { timeout: 4000 }).toBe(0);
    expect(await sameCanvas(), "the scene remounted between the layers and the review stack").toBe(true);
    await shot(page, "04-review-stack");

    // --- closure: only after the server acknowledges ------------------
    await holdToSubmit(page, submitBtn);
    await expect(page.getByText(/ESTIMATE|ENGAGEMENT/i).first()).toBeVisible({ timeout: 15000 });
    await expect(scene(page)).toHaveCount(1);
    await expectClearOf(page, page.getByRole("heading").first(), "the estimate heading", "text");
    expect(await sameCanvas(), "the scene remounted between the review stack and the closure").toBe(true);
    await shot(page, "05-result-closure");

    // --- profile: the closure as the screen's subject ------------------
    // Returning to /diagnostic with a completed diagnostic lands on the
    // profile-ready screen, whose two-column grid has only one child — so
    // the closure composition occupies the empty column rather than
    // accompanying content from the margin.
    await page.goto("/diagnostic");
    await expect(page.getByText(/PROFILE READY/i)).toBeVisible({ timeout: 10000 });
    await expect(scene(page)).toHaveCount(1);
    await expectClearOf(page, page.getByRole("heading").first(), "the profile heading", "text");
    await expectClearOf(
      page,
      page.getByRole("button", { name: /Start a new diagnostic/i }),
      "the start-new control"
    );
    expect(await labelOpacity(page, 0)).toBe(0);
    await shot(page, "10-profile-closure");

    expect(errors, `console errors across the scene journey:\n${errors.join("\n")}`).toEqual([]);
  });

  test("a failed submission holds the review stack and does not reach closure", async ({ page }) => {
    // The scene must never anticipate success. On failure it stays in the
    // review structure, because nothing has been persisted.
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

    // Still mounted, still the stack, still unlabelled — and crucially the
    // estimate screen was never reached.
    await expect(scene(page)).toHaveCount(1);
    expect(await labelOpacity(page, 0)).toBe(0);
    await expect(page.getByText(/ESTIMATE|ENGAGEMENT/i)).toHaveCount(0);
    await expectClearOf(page, page.getByText("That didn't go through."), "the failure message", "text");
    await shot(page, "06-submit-error-stack");
  });

  test("reduced motion still advances the stages, it just does not animate them", async ({ page }) => {
    // The regression this guards: with no frame loop running, a stage
    // change had nothing to pick it up, so the scene stayed frozen on
    // whatever composition it mounted with. A visitor who prefers reduced
    // motion saw the entry sphere for the entire journey.
    await page.emulateMedia({ reducedMotion: "reduce" });

    await page.goto("/diagnostic");
    await expect(scene(page)).toHaveCount(1);
    expect(await labelOpacity(page, 0)).toBe(0); // sphere: unlabelled
    await shot(page, "07-reduced-entry");

    await page.getByRole("button", { name: /Start|Begin/i }).first().click();
    await expect(page.getByText("01 / 06")).toBeVisible();
    // Rendered once for the layers stage, without animating into it.
    await expect.poll(() => labelOpacity(page, 0), { timeout: 4000 }).toBe(1);
    await shot(page, "08-reduced-layers-step1");

    await fillStep1(page, "Reduced Motion BV");
    await page.getByRole("button", { name: /^Continue$/ }).click();
    await expect(page.getByText("02 / 06")).toBeVisible();
    await expect.poll(() => labelOpacity(page, 1), { timeout: 4000 }).toBe(1);
    expect(await labelOpacity(page, 0)).toBeLessThan(1);
    await shot(page, "09-reduced-layers-step2");
  });

  test("below the layout's threshold the scene is not mounted at all", async ({ page }) => {
    // Not merely hidden with CSS: a hidden canvas still holds a WebGL
    // context. This is the invariant diagnostic-checkpoint5 also protects
    // for phones, asserted here for the later stages too.
    await page.setViewportSize({ width: 900, height: 800 });
    await page.goto("/diagnostic");
    await page.waitForLoadState("networkidle");
    await expect(scene(page)).toHaveCount(0);

    await page.getByRole("button", { name: /Start|Begin/i }).first().click();
    await expect(page.getByText("01 / 06")).toBeVisible();
    await expect(scene(page)).toHaveCount(0);

    // The review-family screens need a wider gutter than 1024px, so at
    // 1100 the entry sphere mounts but the review stack does not.
    await page.setViewportSize({ width: 1100, height: 800 });
    await page.goto("/diagnostic");
    await expect(scene(page)).toHaveCount(1);
  });
});

/**
 * Captures at the widths where the documented thresholds change what is
 * shown, and asserts the thresholds rather than only photographing them.
 *
 * 1024 — the entry sphere and topic layers mount; the review stack and
 * result closure do not, because those layouts' only free space is the
 * page gutter and it is not wide enough until 1280.
 * 1280 — everything mounts.
 * 1440 — the reference width the placements were measured at.
 */
for (const width of [1024, 1280, 1440]) {
  test(`stage placement and thresholds at ${width}px`, async ({ page }) => {
    test.setTimeout(90_000);
    const gutterStages = width >= 1280;
    await page.setViewportSize({ width, height: 900 });

    await page.goto("/diagnostic");
    await expect(scene(page)).toHaveCount(1);
    await shot(page, `w${width}-1-entry`);

    await page.getByRole("button", { name: /Start|Begin/i }).first().click();
    await expect(page.getByText("01 / 06")).toBeVisible();
    await expect(scene(page)).toHaveCount(1);
    // Wherever the layers are actually drawn, they must clear the panel.
    if (await scene(page).first().isVisible()) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(400);
    }
    await shot(page, `w${width}-2-layers`);

    await fillStep1(page, `Width ${width} BV`);
    await answerThroughPriorities(page);
    await page.getByLabel("First name").fill("Width");
    await page.getByLabel("Last name").fill("QA");
    await page.getByLabel("Work email").fill(`w${width}-${Date.now()}@playwright-qa.dev`);
    await page.getByRole("button", { name: /Review/i }).click();
    await expect(page.getByText(/review/i).first()).toBeVisible({ timeout: 5000 });
    await expect(scene(page)).toHaveCount(gutterStages ? 1 : 0);
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

test("the composition carries the real profile, not a decorative stand-in", async ({ page }) => {
  /*
   * The node-map card is gone, so the facts and signals it showed have to
   * live inside the one composition — otherwise this would be a deletion
   * rather than a replacement. These are the visitor's own answers and
   * `buildSignals`' own output, unchanged.
   */
  test.setTimeout(90_000);
  await page.setViewportSize(DESKTOP);
  await page.goto("/diagnostic");
  await page.getByRole("button", { name: /Start|Begin/i }).first().click();
  await expect(page.getByText("01 / 06")).toBeVisible();

  // Nothing answered yet: the readout says so rather than inventing data.
  await expect(page.getByText(/Your profile will build here as you answer/i)).toBeVisible();
  await expectNodeMapGone(page);

  await fillStep1(page, "Composition QA BV");
  // The industry and team size the visitor just chose appear in the
  // composition, in the same column as the scene.
  const industry = await page.locator("select").first().inputValue();
  await expect.poll(async () => (await page.locator("body").innerText()).includes(industry), { timeout: 6000 }).toBe(true);

  await page.getByRole("button", { name: /^Continue$/ }).click();
  await expect(page.getByText("02 / 06")).toBeVisible();
  // Still one canvas, still one composition.
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(page.getByText(/Preliminary Signals/i)).toBeVisible();

  await shot(page, "11-composition-with-profile");
});
