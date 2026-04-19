import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/roles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST() {
  // Production 404. Requires both !production AND the explicit opt-in flag.
  if (
    process.env.NODE_ENV === "production" ||
    process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS !== "true"
  ) {
    return new NextResponse("Not found", { status: 404 });
  }
  await requireAdmin();
  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("seed_dev_fixtures");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
