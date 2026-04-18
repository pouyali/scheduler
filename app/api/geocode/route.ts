import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/roles";
import { geocodeAddress } from "@/lib/mapbox/geocode";

export async function POST(request: Request) {
  await requireAdmin();
  const body = (await request.json()) as { address?: string };
  if (!body.address || typeof body.address !== "string") {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }
  const result = await geocodeAddress(body.address);
  return NextResponse.json(result);
}
