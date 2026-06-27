import { test, expect } from "@playwright/test";

const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const APP_ERROR = "Something went sideways";
const CHARACTER_HREF =
  /\/characters\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Authenticated character-view e2e — the regression guard for the 2026-06-27 crash.
 * Opening a real character renders <CharacterDashboard> (a Server Component) with the
 * full attacks/skills/feats/spells, which is exactly where the RSC function-prop bug
 * lived. A jsdom unit test renders everything client-side and can't see it; only a real
 * browser hitting a real build does.
 *
 * Gated on E2E credentials so it runs only where a test account exists. To enable, set
 * E2E_EMAIL + E2E_PASSWORD to a CONFIRMED account that owns at least one character.
 */
test.describe("authenticated character view", () => {
  test.skip(
    !EMAIL || !PASSWORD,
    "set E2E_EMAIL + E2E_PASSWORD (a confirmed account with >=1 character) to run",
  );

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill(EMAIL!);
    await page.locator("#password").fill(PASSWORD!);
    await page.getByRole("button", { name: /^Sign in$/ }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
  });

  test("opening a character renders the dashboard (no RSC/render crash)", async ({ page }) => {
    await page.goto("/characters");
    const links = page.locator('a[href^="/characters/"]');
    await links.first().waitFor({ timeout: 15_000 });

    // Pick the first link whose href is a character id (not /new or /import).
    const hrefs = await links.evaluateAll((els) =>
      els.map((el) => (el as HTMLAnchorElement).getAttribute("href") ?? ""),
    );
    const characterHref = hrefs.find((h) => CHARACTER_HREF.test(h));
    test.skip(!characterHref, "test account owns no characters — create one to exercise this guard");

    const res = await page.goto(characterHref!, { waitUntil: "domcontentloaded" });
    expect(res!.status(), "character view HTTP status").toBeLessThan(400);
    // The crash rendered the error boundary instead of the sheet.
    await expect(page.getByText(APP_ERROR)).toHaveCount(0);
    // A rendered sheet always has at least one heading from the dashboard.
    await expect(page.getByRole("heading").first()).toBeVisible();
  });
});
