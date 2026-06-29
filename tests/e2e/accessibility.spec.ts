import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Accessibility smoke — axe-scan the public routes for WCAG 2.0/2.1 A + AA violations. Like the
 * public render smoke, these need no auth or seeded data, so they run on every push. The assertion
 * message dumps the offending rule ids + node counts so a failure is actionable from the CI log.
 */
const ROUTES = ["/", "/login", "/signup", "/developers"];

for (const route of ROUTES) {
  test(`a11y: ${route} has no WCAG A/AA violations`, async ({ page }) => {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const summary = results.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }));
    expect(results.violations, JSON.stringify(summary, null, 2)).toEqual([]);
  });
}
