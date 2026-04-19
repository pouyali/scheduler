import { test, expect } from "@playwright/test";

test("admin creates, edits, archives, and unarchives a senior", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill("admin@local.test");
  await page.getByLabel(/password/i).fill("password123!");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/admin/);

  await page.goto("/admin/seniors/new");
  await page.getByLabel("First name").fill("Margaret");
  await page.getByLabel("Last name").fill("Chen");
  await page.getByLabel("Phone").fill("(604) 555-0134");
  await page.getByLabel("Address line 1").fill("1245 Robson St");
  await page.getByLabel("City").fill("Vancouver");
  await page.getByLabel("Postal code").fill("V6E 1B9");
  await page.getByRole("button", { name: /create senior/i }).click();

  await expect(page).toHaveURL(/\/admin\/seniors\/[0-9a-f-]+/);
  await expect(page.getByRole("heading", { name: /Margaret Chen/ })).toBeVisible();

  await page.getByLabel("City").fill("Burnaby");
  await page.getByRole("button", { name: /save changes/i }).click();
  await expect(page).toHaveURL(/\/admin\/seniors\/[0-9a-f-]+/);
  await expect(page.getByLabel("City")).toHaveValue("Burnaby");

  await page.getByRole("button", { name: /^archive$/i }).click();
  // Wait for the archive action to complete — the Unarchive button appears when archived
  await expect(page.getByRole("button", { name: /unarchive/i })).toBeVisible();

  await page.goto("/admin/seniors");
  await expect(page.getByText("Margaret Chen")).toHaveCount(0);

  await page.goto("/admin/seniors?archived=true");
  await expect(page.getByRole("link", { name: /Margaret Chen/ }).first()).toBeVisible();

  await page.getByRole("link", { name: /Margaret Chen/ }).first().click();
  await page.getByRole("button", { name: /unarchive/i }).click();
  // Wait for the unarchive action to complete — the Archive button reappears
  await expect(page.getByRole("button", { name: /^archive$/i })).toBeVisible();

  await page.goto("/admin/seniors");
  await expect(page.getByRole("link", { name: /Margaret Chen/ }).first()).toBeVisible();
});
