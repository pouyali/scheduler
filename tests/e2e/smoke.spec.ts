import { test, expect } from "@playwright/test";

test("homepage responds", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/.+/);
});
