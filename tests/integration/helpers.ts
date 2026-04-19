import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export function adminClient() {
  return createClient<Database>(URL, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function anonClient() {
  return createClient<Database>(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function createAdminUser(email: string) {
  const admin = adminClient();
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: "password123!",
    email_confirm: true,
  });
  if (error) throw error;
  const userId = created.user.id;
  const { error: insErr } = await admin.from("admins").insert({
    id: userId,
    first_name: "Test",
    last_name: "Admin",
  });
  if (insErr) throw insErr;
  return { userId, email };
}

export async function createVolunteerUser(
  email: string,
  status: "pending" | "active" | "inactive" = "pending",
) {
  const admin = adminClient();
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: "password123!",
    email_confirm: true,
  });
  if (error) throw error;
  const userId = created.user.id;
  const { error: insErr } = await admin.from("volunteers").insert({
    id: userId,
    first_name: "Test",
    last_name: "Volunteer",
    email,
    categories: ["transportation"],
    service_area: "Toronto",
    auth_provider: "email",
    status,
  });
  if (insErr) throw insErr;
  return { userId, email };
}

export async function signIn(email: string, password = "password123!") {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

/**
 * Delete every row from the given tables using the service-role client.
 * Equivalent to a truncate for tests: no reliance on SQL sequences, just wipes
 * the data so each test starts from a clean slate.
 */
export async function truncate(
  admin: ReturnType<typeof adminClient>,
  tables: string[],
): Promise<void> {
  for (const table of tables) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic table name; Supabase typed API can't express this
    const { error } = await (admin.from(table as any) as any)
      .delete()
      .not("id", "is", null);
    if (error) throw error;
  }
}
