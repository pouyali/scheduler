/*
  Creates a dev admin user in local Supabase.
  Usage: npm run seed:admin
*/
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const EMAIL = process.env.DEV_ADMIN_EMAIL ?? "admin@local.test";
const PASSWORD = process.env.DEV_ADMIN_PASSWORD ?? "password123!";

async function main() {
  const admin = createClient(URL, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: existing } = await admin.auth.admin.listUsers();
  let userId = existing.users.find((u) => u.email === EMAIL)?.id;

  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user.id;
  }

  const { error: upsertErr } = await admin.from("admins").upsert({
    id: userId,
    first_name: "Dev",
    last_name: "Admin",
  });
  if (upsertErr) throw upsertErr;

  console.log(`Dev admin ready: ${EMAIL} / ${PASSWORD}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
