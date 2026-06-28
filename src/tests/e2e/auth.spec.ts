/**
 * E2E Tests: Authentication
 * Tests register, login, and redirect flows.
 */

import { test, expect } from "@playwright/test";

const TEST_EMAIL = `test-${Date.now()}@example.com`;
const TEST_PASSWORD = "TestPass123";
const TEST_NAME = "Test User";

test.describe("Authentication", () => {
  test("landing page loads and shows sign-in options", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/CollabDocs/);
    await expect(page.getByRole("link", { name: /get started/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();
  });

  test("register page shows form with password requirements", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByLabel("Full name")).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();

    // Type a weak password — requirements should appear
    await page.getByLabel("Password").focus();
    await page.getByLabel("Password").fill("short");
    await expect(page.getByText("At least 8 characters")).toBeVisible();
  });

  test("login page shows Google OAuth and credentials form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: /continue with google/i })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
  });

  test("unauthenticated user is redirected from dashboard to login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("unauthenticated user is redirected from editor to login", async ({ page }) => {
    await page.goto("/editor/some-fake-doc-id");
    await expect(page).toHaveURL(/\/login/);
  });

  test("login with wrong password shows error", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("nobody@example.com");
    await page.getByLabel("Password").fill("WrongPassword1");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page.getByRole("alert")).toBeVisible();
  });

  test("register then auto-login redirects to dashboard", async ({ page }) => {
    await page.goto("/register");

    await page.getByLabel("Full name").fill(TEST_NAME);
    await page.getByLabel("Email").fill(TEST_EMAIL);
    await page.getByLabel("Password").fill(TEST_PASSWORD);

    await page.getByRole("button", { name: /create account/i }).click();

    // Should redirect to dashboard
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
    await expect(page.getByText(/My Documents/i)).toBeVisible();
  });
});