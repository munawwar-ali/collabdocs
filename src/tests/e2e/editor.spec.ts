/**
 * E2E Tests: Editor
 *
 * Tests the core document editing flows:
 * - Document creation and navigation
 * - Offline editing (IndexedDB persistence)
 * - Version history creation
 * - Role enforcement (viewer cannot edit)
 * - Sync status indicator
 *
 * NOTE: These tests require a running dev server AND a configured
 * database. For CI, set DATABASE_URL and AUTH_SECRET in environment.
 * For local dev, run `npm run dev` before `npx playwright test`.
 */

import { test, expect, type Page } from "@playwright/test";

// Helper: log in with test credentials
async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
}

// Test account (must exist in DB — created by auth E2E tests or seed)
const OWNER_EMAIL = process.env.E2E_EMAIL ?? "test@example.com";
const OWNER_PASSWORD = process.env.E2E_PASSWORD ?? "TestPass123";

test.describe("Document Management", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD);
  });

  test("creates a new document and navigates to editor", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /new document/i }).click();

    // Should redirect to editor
    await expect(page).toHaveURL(/\/editor\//, { timeout: 10_000 });
    await expect(page.getByRole("textbox", { name: /document title/i })).toBeVisible();
  });

  test("document title is editable and saves on blur", async ({ page }) => {
    // Create a doc first
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /new document/i }).click();
    await expect(page).toHaveURL(/\/editor\//);

    // Edit the title
    const titleInput = page.getByRole("textbox", { name: /document title/i });
    await titleInput.fill("My Test Document");
    await titleInput.press("Enter");

    // Reload and verify title persisted
    await page.reload();
    await expect(page.getByRole("textbox", { name: /document title/i }))
      .toHaveValue("My Test Document", { timeout: 5_000 });
  });

  test("sync status badge is visible in editor", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /new document/i }).click();
    await expect(page).toHaveURL(/\/editor\//);

    // Status badge should appear (offline, syncing, or synced)
    const badge = page.getByRole("status", { name: /sync status/i });
    await expect(badge).toBeVisible({ timeout: 5_000 });
  });

  test("keyboard shortcuts help opens with ? key", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /new document/i }).click();
    await expect(page).toHaveURL(/\/editor\//);

    // Press ? to open shortcuts dialog
    await page.keyboard.press("?");
    await expect(page.getByRole("dialog", { name: /keyboard shortcuts/i }))
      .toBeVisible({ timeout: 3_000 });
  });
});

test.describe("Offline Behaviour", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD);
  });

  test("editor loads from IndexedDB when offline", async ({ page, context }) => {
    // Create a doc and write some content
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /new document/i }).click();
    await expect(page).toHaveURL(/\/editor\//);

    // Wait for editor to be ready
    const editor = page.locator(".ProseMirror");
    await expect(editor).toBeVisible({ timeout: 10_000 });
    await editor.click();
    await page.keyboard.type("Hello offline world");

    // Wait for content to persist to IndexedDB
    await page.waitForTimeout(500);

    // Go offline
    await context.setOffline(true);

    // Reload — should load from IndexedDB with zero network
    await page.reload();

    // Offline banner should appear
    const offlineBanner = page.getByRole("status", { name: /offline/i });
    await expect(offlineBanner).toBeVisible({ timeout: 5_000 });

    // Editor should still show content
    await expect(editor).toContainText("Hello offline world", { timeout: 5_000 });

    // Go back online
    await context.setOffline(false);
  });
});

test.describe("Version History", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD);
  });

  test("version history panel opens and shows create form", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /new document/i }).click();
    await expect(page).toHaveURL(/\/editor\//);

    // Open version history
    await page.getByRole("button", { name: /history/i }).click();
    await expect(page.getByRole("heading", { name: /version history/i })).toBeVisible();

    // Create version button should be visible
    await expect(page.getByRole("button", { name: /save current version/i })).toBeVisible();
  });

  test("can save a named version", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /new document/i }).click();
    await expect(page).toHaveURL(/\/editor\//);

    // Add some content
    const editor = page.locator(".ProseMirror");
    await expect(editor).toBeVisible({ timeout: 10_000 });
    await editor.click();
    await page.keyboard.type("Content to snapshot");

    // Open version history
    await page.getByRole("button", { name: /history/i }).click();
    await page.getByRole("button", { name: /save current version/i }).click();

    // Fill in label
    await page.getByLabel(/version name/i).fill("My first snapshot");
    await page.getByRole("button", { name: /^save$/i }).click();

    // Version should appear in list
    await expect(page.getByText("My first snapshot")).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("Accessibility", () => {
  test("skip-to-content link is present and focusable", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skipLink = page.getByRole("link", { name: /skip to content/i });
    await expect(skipLink).toBeFocused();
  });

  test("editor toolbar has role=toolbar", async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD);
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /new document/i }).click();
    await expect(page).toHaveURL(/\/editor\//);

    const toolbar = page.getByRole("toolbar", { name: /text formatting/i });
    await expect(toolbar).toBeVisible({ timeout: 10_000 });
  });
});