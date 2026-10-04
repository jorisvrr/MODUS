import { test, expect } from "@playwright/test";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";

/**
 * The two chosen email layouts, photographed in the four states that
 * matter: images loaded and images blocked, on desktop and on a phone.
 *
 * Blocked images are not an edge case — a large share of people read mail
 * with them off, and every image proxy fails sometimes. The header has to
 * read as MODUS either way, which is what the second column of these
 * captures is for.
 *
 * The previews carry the production origin, so their links and signature
 * read exactly as they will when sent. That URL does not serve the header
 * yet, so the loaded variants fulfil that ONE request from `public/` —
 * the same bytes that will be published — rather than rewriting the HTML,
 * which would make the photograph of a preview a photograph of something
 * else.
 *
 * Requires `email-previews/`, written by
 * `npx vitest run src/lib/notifications/email`.
 */
const DIR = path.join(process.cwd(), "email-previews");
const CASES = [
  ["customer-03-nl", "03-customer-nl-long"],
  ["customer-03-en", "03-customer-en-long"],
  ["admin-08", "08-admin"],
] as const;

for (const [label, file] of CASES) {
  for (const [device, width] of [["desktop", 760], ["mobile", 390]] as const) {
    for (const images of ["loaded", "blocked"] as const) {
      test(`${label} @ ${device}, images ${images}`, async ({ page }) => {
        const src = path.join(DIR, `${file}.html`);
        expect(existsSync(src), `missing preview ${file}.html — generate them first`).toBe(true);

        if (images === "blocked") {
          // What a client with remote images turned off actually does.
          await page.route("**/*.{png,jpg,jpeg,gif,webp,svg}", (r) => r.abort());
        } else {
          await page.route("**/brand/email-header-v1.jpg", (r) =>
            r.fulfill({
              contentType: "image/jpeg",
              body: readFileSync(path.join(process.cwd(), "public/brand/email-header-v1.jpg")),
            })
          );
        }
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`file://${src}`);
        await page.waitForTimeout(600);

        if (images === "loaded") {
          // The real artwork, at its own aspect ratio and not cropped.
          const box = await page.locator("img").first().boundingBox();
          expect(box, "the header image should render").not.toBeNull();
          const ratio = box!.width / box!.height;
          expect(ratio, `header aspect ratio was ${ratio}`).toBeGreaterThan(2.9);
          expect(ratio).toBeLessThan(3.1);
          expect(box!.width).toBeLessThanOrEqual(600 + 1);
        }

        await page.screenshot({
          path: `email-previews/shot-${label}-${device}-${images}.png`,
          fullPage: true,
        });
      });
    }
  }
}
