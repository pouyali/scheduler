import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

test("admin approves, rejects, and reactivates a pending volunteer", async ({ page }) => {
  // Create a pending volunteer via service role (bypasses the self-signup flow).
  const svc = createClient(URL, SERVICE);
  const email = `e2e-pending-${Date.now()}@test.com`;
  const { data: user } = await svc.auth.admin.createUser({
    email,
    password: "Password123!",
    email_confirm: true,
  });
  if (!user.user) throw new Error("user not created");
  await svc.from("volunteers").insert({
    id: user.user.id,
    first_name: "E2E",
    last_name: "Pending",
    email,
    categories: ["transportation"],
    service_area: "Vancouver",
    auth_provider: "email",
    status: "pending",
  });

  // Log in as the seeded dev admin.
  await page.goto("/login");
  await page.getByLabel(/email/i).fill("admin@local.test");
  await page.getByLabel(/password/i).fill("password123!");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/admin/);

  // Go to the Pending tab.
  await page.goto("/admin/volunteers?status=pending");
  await expect(page.getByText("E2E Pending")).toBeVisible();

  // Approve inline.
  const row = page.getByText("E2E Pending").locator("xpath=ancestor::tr");
  await row.getByRole("button", { name: /^approve$/i }).click();
  await expect(page.getByText("E2E Pending")).toHaveCount(0);
  await page.goto("/admin/volunteers?status=active");
  await expect(page.getByText("E2E Pending")).toBeVisible();

  // Mark inactive (reject equivalent) from detail page.
  await page.getByRole("link", { name: /E2E Pending/ }).click();
  await expect(page).toHaveURL(/\/admin\/volunteers\/[0-9a-f-]+/);
  await page.getByRole("button", { name: /mark inactive/i }).click();
  await expect(page.getByRole("button", { name: /reactivate/i })).toBeVisible();

  // Reactivate.
  await page.getByRole("button", { name: /reactivate/i }).click();
  await expect(page.getByRole("button", { name: /mark inactive/i })).toBeVisible();
});
