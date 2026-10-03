import { test, expect, type Page } from "@playwright/test";

/**
 * The hero's process bubbles.
 *
 * They were reported missing on the deployed site. They were not missing:
 * the element existed, the cycle ran and the text changed on every pass.
 * They were positioned in CANVAS space while being absolutely positioned
 * inside the ANCHOR, and the canvas is deliberately overscanned to the
 * size of the hero — so the bubble was placed up to a full overscan to
 * the right. Measured on production at x≈1790 in a 1440px viewport, which
 * is outside the hero's `overflow: hidden` box, so every bubble was
 * clipped away.
 *
 * Nothing in the suite noticed, because "is the element present and
 * animating" was true throughout. These assert the thing that was
 * actually broken: where it ends up on screen.
 */

const BUBBLE = "[data-hero-notification]";

async function sample(page: Page) {
  return page.evaluate((sel) => {
    const d = document.querySelector(sel) as HTMLElement | null;
    if (!d) return null;
    const b = d.getBoundingClientRect();
    return {
      state: d.dataset.state,
      hidden: d.hidden,
      phase: d.parentElement?.dataset.scenePhase,
      opacity: Number(getComputedStyle(d).opacity),
      text: d.textContent?.trim() ?? "",
      left: b.left,
      top: b.top,
      right: b.right,
      bottom: b.bottom,
      insideViewport:
        b.left >= 0 &&
        b.right <= window.innerWidth &&
        b.top >= 0 &&
        b.bottom <= window.innerHeight,
    };
  }, BUBBLE);
}

test.describe("hero process bubbles", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  // Preserve the deployed suite's allowance for slow context teardown.
  test.setTimeout(120_000);

  test("appear on screen, inside the hero, and are never clipped away", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const seen: string[] = [];
    let everVisible = false;
    let everOutside = false;

    // First popup waits for the settled sphere, not a free-running timer.
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(900);
      const s = await sample(page);
      expect(s, "the bubble element should exist").not.toBeNull();
      if (!s!.hidden && s!.state === "in" && s!.opacity > 0.5) {
        everVisible = true;
        if (s!.text) seen.push(s!.text);
        // The real defect: positioned outside the viewport and clipped.
        if (!s!.insideViewport) everOutside = true;
      }
    }

    expect(
      everVisible,
      "a bubble should become visible during the sphere hold",
    ).toBe(true);
    expect(
      everOutside,
      "a visible bubble was positioned outside the viewport and would be clipped by the hero",
    ).toBe(false);
    expect(seen.length, "a bubble should carry its label text").toBeGreaterThan(
      0,
    );
  });

  test("the label changes between cycles rather than repeating one", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    /*
     * Condition-based rather than a fixed number of samples. A cycle is
     * ~5s (3s hold, 2s gap) and the loop only advances while the scene is
     * visible and the tab is active, so under load fewer cycles complete
     * in a given wall-clock window — which made a fixed sample count fail
     * intermittently in a full-suite run while passing in isolation.
     * `pickBubble` cannot repeat an index consecutively, so two distinct
     * labels is the right assertion; it just needs long enough to see
     * two bubbles.
     */
    // Preserve the deployed test's in-page observer: round-trip polling can
    // miss a short popup on a slow connection.
    await page.evaluate((selector) => {
      const w = window as unknown as { __bubbleLabels?: Set<string> };
      w.__bubbleLabels = new Set<string>();
      const el = document.querySelector(selector) as HTMLElement | null;
      if (!el) return;
      const record = () => {
        if (!el.hidden && el.dataset.state === "in") {
          const text = el.textContent?.trim();
          if (text) w.__bubbleLabels!.add(text);
        }
      };
      record();
      new MutationObserver(record).observe(el, {
        attributes: true,
        attributeFilter: ["data-state", "hidden"],
        childList: true,
        subtree: true,
        characterData: true,
      });
    }, BUBBLE);
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              (window as unknown as { __bubbleLabels?: Set<string> })
                .__bubbleLabels?.size ?? 0,
          ),
        { timeout: 45_000, intervals: [1000] },
      )
      .toBeGreaterThan(1);
  });

  test("they sit over the scene, not over the headline column", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const heading = await page
      .getByRole("heading", { level: 1 })
      .first()
      .boundingBox();
    expect(heading).not.toBeNull();

    for (let i = 0; i < 8; i++) {
      await page.waitForTimeout(900);
      const s = await sample(page);
      if (s?.hidden || s?.state !== "in" || s.opacity <= 0.5) continue;
      // The scene is to the right of the copy; a bubble must not land on
      // the headline.
      const overlapsHeading =
        s.left < heading!.x + heading!.width &&
        s.right > heading!.x &&
        s.top < heading!.y + heading!.height &&
        s.bottom > heading!.y;
      expect(
        overlapsHeading,
        `bubble overlapped the headline at ${s.left},${s.top}`,
      ).toBe(false);
    }
  });

  test("popups stay inside the sphere hold and vanish before dispersal", async ({
    page,
  }) => {
    await page.goto("/");
    const phases = new Set<string>();
    let sawPopup = false;
    for (let i = 0; i < 110; i++) {
      const s = await sample(page);
      if (s?.phase) phases.add(s.phase);
      if (s && !s.hidden && s.opacity > 0.05) {
        sawPopup = true;
        expect(
          s.phase,
          "an actually visible popup must be in the sphere phase",
        ).toBe("sphere");
      }
      if (s?.phase === "network") expect(s.hidden).toBe(true);
      await page.waitForTimeout(150);
    }
    expect(sawPopup).toBe(true);
    expect([...phases].sort()).toEqual(["network", "sphere"]);
  });

  test("the hard hide really hides: display:none, not just the attribute", async ({
    page,
  }) => {
    /*
     * `hidden` on its own is not enough here. The card carries a `flex`
     * utility, and a class-based `display` outranks the user-agent
     * `[hidden] { display: none }` rule — the same bug class that once
     * left the WebGL fallback painted over a live scene in this project.
     * The card declares `[&[hidden]]:hidden` for exactly this reason, so
     * the computed value is what gets asserted, not the attribute.
     */
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    let sawNetwork = false;
    for (let i = 0; i < 110; i++) {
      const s = await page.evaluate((sel) => {
        const d = document.querySelector(sel) as HTMLElement | null;
        if (!d) return null;
        return {
          phase: d.parentElement?.dataset.scenePhase,
          display: getComputedStyle(d).display,
          width: d.getBoundingClientRect().width,
        };
      }, BUBBLE);
      if (s?.phase === "network") {
        expect(s.display, "a hidden card must compute to display:none").toBe("none");
        expect(s.width, "a hidden card must occupy no box").toBe(0);
        sawNetwork = true;
      }
      await page.waitForTimeout(150);
    }
    expect(sawNetwork, "the network phase should have been observed").toBe(true);
  });

  test("reduced motion does not run the bubble cycle", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(4000);
    const s = await sample(page);
    // The element may exist, but it must never be animated into view.
    expect(s?.state).toBe("out");
  });
});

for (const [name, viewport] of [
  ["desktop", { width: 1440, height: 900 }],
  ["mobile", { width: 390, height: 844 }],
] as const) {
  test(`capture the updated hero at ${name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    // Wait for a cycle where the bubble is actually up, so the capture
    // shows the thing being claimed rather than the gap between bubbles.
    for (let i = 0; i < 28; i++) {
      const s = await sample(page);
      if (!s?.hidden && s?.state === "in" && s.opacity > 0.9) break;
      await page.waitForTimeout(500);
    }
    const final = await sample(page);
    if (name === "desktop") {
      expect(final?.hidden).toBe(false);
      expect(final?.phase).toBe("sphere");
      expect(final?.opacity).toBeGreaterThan(0.9);
    } else {
      expect(final?.hidden).toBe(true);
    }
    await page.screenshot({ path: `e2e-screens/hero-bubble-${name}.png` });
  });
}
