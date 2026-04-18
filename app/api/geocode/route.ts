import { NextResponse } from "next/server";
import { getUserRole } from "@/lib/auth/roles";
import { geocodeAddress } from "@/lib/mapbox/geocode";

export async function POST(request: Request) {
  const role = await getUserRole();
  if (role.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }
  const body = (await request.json()) as { address?: string };
  if (!body.address || typeof body.address !== "string") {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }
  const result = await geocodeAddress(body.address);
  return NextResponse.json(result);
}
