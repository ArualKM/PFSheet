import { test, expect, type Page } from "@playwright/test";

/**
 * Public-route smoke tests. These need no auth and no seeded data, so they run in CI on
 * every push. Their job is to catch *render-time* crashes in a REAL browser against a REAL
 * build — the class of bug that jsdom unit tests + `next build` both miss (e.g. the
 * 2026-06-27 character-view crash, a function prop passed across the RSC server→client
 * boundary). Each page must respond < 400 and must NOT show the app error boundary.
 */

// The (app) error boundary headline (app/(app)/error.tsx). If it ever appears on a page,
// a Server Component threw during render.
const APP_ERROR = "Something went sideways";

const pages: Array<{ path: string; check: (page: Page) => Promise<void> }> = [
  {
    path: "/",
    check: async (page) => {
      await expect(page.locator("body")).toContainText("PathForge");
    },
  },
  {
    path: "/login",
    check: async (page) => {
      await expect(page.locator('input[type="password"]')).toBeVisible();
      await expect(page.locator("body")).toContainText("Welcome back");
    },
  },
  {
    path: "/signup",
    check: async (page) => {
      await expect(page.locator('input[type="password"]')).toBeVisible();
      await expect(page.locator("body")).toContainText("Create your account");
    },
  },
  {
    path: "/developers",
    check: async (page) => {
      await expect(page.locator("body")).toContainText("API");
    },
  },
  {
    path: "/offline",
    check: async (page) => {
      await expect(page.locator("body")).toContainText(/offline/i);
    },
  },
];

for (const { path, check } of pages) {
  test(`public page renders without crashing: ${path}`, async ({ page }) => {
    const res = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(res, `no response for ${path}`).not.toBeNull();
    expect(res!.status(), `HTTP status for ${path}`).toBeLessThan(400);
    await expect(page.getByText(APP_ERROR)).toHaveCount(0);
    await check(page);
  });
}

test("API: health, discovery, and OpenAPI spec respond", async ({ request }) => {
  const health = await request.get("/api/v1/health");
  expect(health.ok()).toBeTruthy();
  expect((await health.json()).data).toMatchObject({ status: "ok", service: "pathforge" });

  const discovery = await request.get("/api/v1");
  expect(discovery.ok()).toBeTruthy();
  expect((await discovery.json()).data.name).toBe("PathForge API");

  const openapi = await request.get("/api/v1/openapi.json");
  expect(openapi.ok()).toBeTruthy();
  const spec = await openapi.json();
  expect(spec.openapi).toMatch(/^3\.1/);
  expect(spec.info?.title).toBeTruthy();
});
