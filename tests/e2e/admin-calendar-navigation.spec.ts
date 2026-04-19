import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

test("admin opens calendar, sees event, clicks through", async ({ page }) => {
  const svc = createClient(URL, SERVICE);
  const ts = Date.now();

  const { data: admins } = await svc.from("admins").select("id").limit(1);
  const adminId = admins![0].id;

  const firstName = `Cal${ts % 10000}`;
  const { data: senior } = await svc.from("seniors").insert({
    first_name: firstName, last_name: "Test", phone: "416-555-9999",
    address_line1: "1 Main St", city: "Toronto", province: "ON", postal_code: "M1A1A1",
    created_by: adminId,
  }).select().single();

  const soon = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();
  const { data: req } = await svc.from("service_requests").insert({
    senior_id: senior!.id, category: "transportation", priority: "normal",
    requested_at: soon, description: "cal smoke", created_by: adminId, status: "open",
  }).select().single();

  const eventTitle = new RegExp(`${firstName} · transportation`);

  await page.goto("/login");
  await page.getByLabel(/email/i).fill("admin@local.test");
  await page.getByLabel(/password/i).fill("password123!");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/admin/);
  await page.goto("/admin/calendar");

  // Switch to Agenda view so all events are listed (month view collapses overflow with "+N more").
  await page.getByRole("button", { name: /agenda/i }).click();

  await expect(page.getByText(eventTitle).first()).toBeVisible();
  await page.getByText(eventTitle).first().click();
  await expect(page).toHaveURL(new RegExp(`/admin/requests/${req!.id}`));
});
