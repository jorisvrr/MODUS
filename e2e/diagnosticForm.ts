import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Locators for the diagnostic's question column.
 *
 * Why these are shared rather than redefined per spec: the composition
 * beside the form explains each topic and summarises what has been
 * recorded, so words from the questions legitimately appear twice on the
 * page — a summary of "Locations" is labelled "Locations", and the
 * explanation for the first step mentions locations in a sentence.
 * `page.getByText("Locations")` therefore no longer means "the Locations
 * question"; it means "that word anywhere", and with `exact: false` it
 * matches case-insensitively too.
 *
 * Scoping to the step element removes that ambiguity at the source,
 * instead of each spec working around it with a different regex.
 */
export function stepArea(page: Page): Locator {
  return page.locator("[data-diagnostic-step]");
}

/**
 * Clicks the first option of the question whose label contains `text`,
 * within the current step only.
 */
export async function clickFirstOptionNear(page: Page, text: string) {
  const heading = stepArea(page).getByText(text, { exact: false }).first();
  await expect(heading, `no question matching "${text}" in the current step`).toBeVisible();
  await heading.locator("xpath=following-sibling::div[1]").locator("button").first().click();
}
