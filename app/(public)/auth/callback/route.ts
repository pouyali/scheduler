import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/login?error=missing_code", url));

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, url));
  }

  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.redirect(new URL("/login", url));

  const { data: admin } = await supabase
    .from("admins")
    .select("id")
    .eq("id", data.user.id)
    .maybeSingle();
  if (admin) return NextResponse.redirect(new URL("/admin", url));

  const { data: volunteer } = await supabase
    .from("volunteers")
    .select("id, status")
    .eq("id", data.user.id)
    .maybeSingle();
  if (!volunteer) return NextResponse.redirect(new URL("/signup/complete-profile", url));

  return NextResponse.redirect(new URL("/volunteer/dashboard", url));
}
