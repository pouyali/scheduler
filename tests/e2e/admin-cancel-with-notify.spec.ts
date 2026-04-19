import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

test("admin cancels a notified request and volunteer dashboard invite disappears", async ({ page, browser }) => {
  const svc = createClient(URL, SERVICE);
  const ts = Date.now();
  const volEmail = `e2e-cancel-v-${ts}@test.com`;

  const { data: u } = await svc.auth.admin.createUser({ email: volEmail, password: "Password123!", email_confirm: true });
  const vid = u.user!.id;
  await svc.from("volunteers").insert({
    id: vid, first_name: "E2E", last_name: "Cancel", email: volEmail,
    categories: ["transportation"], service_area: "Toronto", auth_provider: "email", status: "active",
  });

  const { data: admins } = await svc.from("admins").select("id").limit(1);
  const adminId = admins![0].id;
  const { data: senior } = await svc.from("seniors").insert({
    first_name: "Jane", last_name: "X", phone: "416-555-0003",
    address_line1: "3 Main St", city: "Toronto", province: "ON", postal_code: "M1A1A1",
    created_by: adminId,
  }).select().single();
  const { data: req } = await svc.from("service_requests").insert({
    senior_id: senior!.id, category: "transportation", priority: "normal",
    requested_at: "2030-06-01T14:00:00.000Z", description: "x", created_by: adminId, status: "notified",
  }).select().single();
  await svc.from("response_tokens").insert({
    token: `cancel-tok-${ts}`, request_id: req!.id, volunteer_id: vid,
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
  });
  await svc.from("notifications").insert({
    request_id: req!.id, volunteer_id: vid, channel: "email", status: "sent", event_type: "invite",
  });

  // Admin cancels with notify.
  await page.goto("/login");
  await page.getByLabel(/email/i).fill("admin@local.test");
  await page.getByLabel(/password/i).fill("password123!");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/admin/);
  await page.goto(`/admin/requests/${req!.id}`);
  await page.getByRole("button", { name: /^cancel$/i }).click();
  await page.getByLabel(/notify recipients/i).check();
  await page.getByRole("button", { name: /cancel request/i }).click();
  await expect(page.getByText(/cancelled/i).first()).toBeVisible();

  // Volunteer sees empty invites.
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await p2.goto("/login");
  await p2.getByLabel(/email/i).fill(volEmail);
  await p2.getByLabel(/password/i).fill("Password123!");
  await p2.getByRole("button", { name: /sign in/i }).click();
  await expect(p2.getByText(/no pending invites/i)).toBeVisible();
  await ctx.close();
});
