import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

test("volunteer signup → admin approve → login", async ({ page }) => {
  const email = `e2e-${Date.now()}@test.com`;
  const password = "Password123!";

  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password (min 8)").fill(password);
  await page.getByRole("button", { name: /create account/i }).click();

  await page.waitForURL(/complete-profile/);
  await page.getByLabel("First name").fill("E2E");
  await page.getByLabel("Last name").fill("User");
  await page.getByLabel("Service area (city)").fill("Toronto");
  await page.getByRole("checkbox", { name: /transportation/i }).check();
  await page.getByRole("button", { name: /save and continue/i }).click();

  await page.waitForURL(/volunteer\/dashboard/);
  await expect(page.getByText(/awaiting admin approval/i)).toBeVisible();

  const admin = createClient(URL, SERVICE);
  const { data: users } = await admin.auth.admin.listUsers();
  const user = users.users.find((u) => u.email === email);
  if (!user) throw new Error("user not found");
  const { error } = await admin.from("volunteers").update({ status: "active" }).eq("id", user.id);
  if (error) throw error;

  await page.reload();
  await expect(page.getByText(/awaiting admin approval/i)).not.toBeVisible();
  await expect(page.getByText(/no pending invites/i)).toBeVisible();
});
