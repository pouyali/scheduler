import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

test("admin broadcasts, first volunteer to accept wins, sibling is superseded", async ({ page, browser }) => {
  const svc = createClient(URL, SERVICE);
  const ts = Date.now();

  // Seed two active volunteers.
  const emails = [`e2e-v1-${ts}@test.com`, `e2e-v2-${ts}@test.com`];
  const volunteerIds: string[] = [];
  for (const email of emails) {
    const { data: u } = await svc.auth.admin.createUser({ email, password: "Password123!", email_confirm: true });
    volunteerIds.push(u.user!.id);
    await svc.from("volunteers").insert({
      id: u.user!.id, first_name: "E2E", last_name: `V${volunteerIds.length}`, email,
      categories: ["transportation"], service_area: "Toronto", auth_provider: "email", status: "active",
    });
  }

  // Seed a senior. `created_by` must be the dev admin's id — look it up.
  const { data: admins } = await svc.from("admins").select("id").limit(1);
  const adminId = admins![0].id;
  const { data: senior } = await svc.from("seniors").insert({
    first_name: "E2E", last_name: "Senior", phone: "416-555-0001",
    address_line1: "1 Main St", city: "Toronto", province: "ON", postal_code: "M1A1A1",
    created_by: adminId,
  }).select().single();

  // Log in as admin and create the request.
  await page.goto("/login");
  await page.getByLabel(/email/i).fill("admin@local.test");
  await page.getByLabel(/password/i).fill("password123!");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/admin/);

  await page.goto("/admin/requests/new");
  await page.getByLabel(/senior search/i).fill("E2E");
  await page.getByRole("button", { name: /E2E Senior/ }).first().click();
  await page.selectOption("select[name=category]", { label: "Transportation" });
  await page.fill("input[name=requested_date]", "2030-06-01");
  await page.fill("textarea[name=description]", "e2e test request");
  await page.getByRole("button", { name: /create request/i }).click();
  await expect(page).toHaveURL(/\/admin\/requests\/[0-9a-f-]+$/);

  // Accept any confirmation dialog (>25 volunteers triggers window.confirm in the UI).
  page.on("dialog", (dialog) => dialog.accept());

  // Select all eligible volunteers and send (may include leftover volunteers from other test runs).
  await page.getByRole("button", { name: /select all/i }).first().click();
  await page.getByRole("button", { name: /send to \d+ volunteer/i }).click();
  await expect(page.getByText(/sent to \d+ volunteer/i)).toBeVisible({ timeout: 15000 });

  // Grab the request id from the URL and v1's token directly from DB.
  const requestId = page.url().split("/").pop()!;
  const { data: tokens } = await svc.from("response_tokens")
    .select("token, volunteer_id")
    .eq("request_id", requestId);
  const v1Token = tokens!.find(t => t.volunteer_id === volunteerIds[0])!.token;

  // v1 accepts via magic link in an unauthenticated context.
  const ctx = await browser.newContext();
  const page2 = await ctx.newPage();
  await page2.goto(`/respond/${encodeURIComponent(v1Token)}?action=accept`);
  await expect(page2).toHaveURL(/\/respond\/.+\/accepted$/);
  await expect(page2.getByRole("heading", { name: /you've got it/i })).toBeVisible();
  await ctx.close();

  // Back on admin: status accepted, superseded sibling visible.
  await page.reload();
  await expect(page.getByText(/accepted/i).first()).toBeVisible();
  await expect(page.getByText(/superseded/i).first()).toBeVisible();
});
