import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  await requireAdmin();
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json([]);

  const escaped = q.replace(/[%_]/g, "").replace(/"/g, '""');
  const term = `"%${escaped}%"`;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("seniors")
    .select("id, first_name, last_name, city, phone")
    .or(`first_name.ilike.${term},last_name.ilike.${term},phone.ilike.${term}`)
    .order("last_name")
    .limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
