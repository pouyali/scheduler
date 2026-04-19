import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Params = { token: string };

export async function GET(
  request: Request,
  ctx: { params: Promise<Params> },
): Promise<Response> {
  const { token } = await ctx.params;
  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  if (action !== "accept" && action !== "decline") {
    return redirect(url, token, "invalid");
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("consume_response_token", {
    p_token: token,
    p_action: action,
  });

  if (error) {
    const code = (error as { code?: string }).code;
    if (code === "40P01" || code === "55P03") {
      return redirect(url, token, "already-filled");
    }
    console.error("consume_response_token error", error);
    return redirect(url, token, "invalid");
  }

  const outcome = (data as { outcome: string } | null)?.outcome ?? "invalid";

  switch (outcome) {
    case "accepted":
      return redirect(url, token, "accepted");
    case "declined":
      return redirect(url, token, "declined");
    case "already_filled":
      return redirect(url, token, "already-filled");
    case "expired":
    case "invalid":
    default:
      return redirect(url, token, "invalid");
  }
}

function redirect(url: URL, token: string, slug: string): Response {
  const target = new URL(`/respond/${encodeURIComponent(token)}/${slug}`, url.origin);
  return NextResponse.redirect(target, 303);
}
