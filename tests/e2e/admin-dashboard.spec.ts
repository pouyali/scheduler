import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

test("admin dashboard shows stat cards + upcoming list + activity feed", async ({ page }) => {
  const svc = createClient(URL, SERVICE);
  const ts = Date.now();

  const { data: admins } = await svc.from("admins").select("id").limit(1);
  const adminId = admins![0].id;

  // Seed an open request in the next 7 days + an accepted event in activity.
  const firstName = `Dash${ts % 10000}`;
  const { data: senior } = await svc.from("seniors").insert({
    first_name: firstName, last_name: "Smoke", phone: "416-555-0000",
    address_line1: "1 Main St", city: "Toronto", province: "ON", postal_code: "M1A1A1",
    created_by: adminId,
  }).select().single();

  const soon = new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString();
  await svc.from("service_requests").insert({
    senior_id: senior!.id, category: "transportation", priority: "normal",
    requested_at: soon, description: "x", created_by: adminId, status: "open",
  });

  const upcomingText = new RegExp(`${firstName} · transportation`);

  await page.goto("/login");
  await page.getByLabel(/email/i).fill("admin@local.test");
  await page.getByLabel(/password/i).fill("password123!");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/admin/);
  await page.goto("/admin");

  await expect(page.getByText(/Open requests/)).toBeVisible();
  await expect(page.getByText(/Upcoming requests/)).toBeVisible();
  await expect(page.getByText(upcomingText).first()).toBeVisible();
  await expect(page.getByText(/Recent activity/)).toBeVisible();
});
