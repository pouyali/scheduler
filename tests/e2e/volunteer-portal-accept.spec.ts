import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

test("volunteer accepts invite from dashboard card", async ({ page }) => {
  const svc = createClient(URL, SERVICE);
  const ts = Date.now();
  const email = `e2e-portal-${ts}@test.com`;

  const { data: u } = await svc.auth.admin.createUser({ email, password: "Password123!", email_confirm: true });
  const volunteerId = u.user!.id;
  await svc.from("volunteers").insert({
    id: volunteerId, first_name: "E2E", last_name: "Portal", email,
    categories: ["transportation"], service_area: "Toronto", auth_provider: "email", status: "active",
  });

  const { data: admins } = await svc.from("admins").select("id").limit(1);
  const adminId = admins![0].id;
  const { data: senior } = await svc.from("seniors").insert({
    first_name: "Jane", last_name: "Doe", phone: "416-555-0002",
    address_line1: "2 Main St", city: "Toronto", province: "ON", postal_code: "M1A1A1",
    created_by: adminId,
  }).select().single();
  const { data: req } = await svc.from("service_requests").insert({
    senior_id: senior!.id, category: "transportation", priority: "normal",
    requested_date: "2030-06-01", description: "ride", created_by: adminId, status: "notified",
  }).select().single();
  await svc.from("response_tokens").insert({
    token: `e2e-tok-${ts}`, request_id: req!.id, volunteer_id: volunteerId,
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
  });
  await svc.from("notifications").insert({
    request_id: req!.id, volunteer_id: volunteerId, channel: "email", status: "sent", event_type: "invite",
  });

  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill("Password123!");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/volunteer\/dashboard/);

  await expect(page.getByRole("heading", { name: /pending invites/i })).toBeVisible();
  await expect(page.getByText("Jane")).toBeVisible();
  await page.getByRole("button", { name: /^accept$/i }).click();

  await expect(page.getByText(/upcoming accepted/i)).toBeVisible();
  await expect(page.getByText(/Jane Doe/)).toBeVisible();
});
