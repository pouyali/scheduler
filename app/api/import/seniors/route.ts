import { NextResponse } from "next/server";
import pMap from "p-map";
import { requireAdmin } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseSeniorsCsv, type ParsedRow } from "@/lib/csv/parse-seniors";
import { buildErrorReport } from "@/lib/csv/error-report";
import { geocodeAddress } from "@/lib/mapbox/geocode";
import { insertSeniorsMany } from "@/lib/db/queries/seniors";

type PreviewRow = {
  rowNumber: number;
  errors: string[];
  data: ParsedRow["data"];
  geocode: { lat: number; lng: number } | null;
  raw: Record<string, string>;
};

export async function POST(request: Request) {
  const admin = await requireAdmin();
  const form = await request.formData();
  const step = form.get("step");

  if (step === "preview") {
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }
    const text = await file.text();
    const rows = parseSeniorsCsv(text);
    const geocoded = await pMap(
      rows,
      async (r): Promise<PreviewRow> => {
        if (r.errors.length > 0 || r.data === null) {
          return { ...r, geocode: null };
        }
        const full = `${r.data.address_line1}, ${r.data.city}, ${r.data.province}, ${r.data.postal_code}, Canada`;
        const geo = await geocodeAddress(full);
        return {
          rowNumber: r.rowNumber,
          errors: [],
          data: r.data,
          raw: r.raw,
          geocode: geo.ok ? { lat: geo.lat, lng: geo.lng } : null,
        };
      },
      { concurrency: 5 },
    );
    const summary = {
      total: geocoded.length,
      valid: geocoded.filter((r) => r.errors.length === 0 && r.geocode).length,
      geocodeFailed: geocoded.filter((r) => r.errors.length === 0 && !r.geocode).length,
      invalid: geocoded.filter((r) => r.errors.length > 0).length,
    };
    return NextResponse.json({ rows: geocoded, summary });
  }

  if (step === "commit") {
    const payload = form.get("payload");
    if (typeof payload !== "string") {
      return NextResponse.json({ error: "payload required" }, { status: 400 });
    }
    const parsed = JSON.parse(payload) as {
      rows: PreviewRow[];
      confirmed: number[];
    };
    const supabase = await createSupabaseServerClient();
    const toInsert: Array<{
      first_name: string;
      last_name: string;
      phone: string;
      email: string | null;
      address_line1: string;
      address_line2: string | null;
      city: string;
      province: string;
      postal_code: string;
      notes: string | null;
      lat: number | null;
      lng: number | null;
      created_by: string;
    }> = [];
    const rejected: Array<{ rowNumber: number; errors: string[]; raw: Record<string, string> }> = [];
    for (const r of parsed.rows) {
      const isConfirmed = parsed.confirmed.includes(r.rowNumber);
      if (!isConfirmed) continue;
      if (r.errors.length > 0 || !r.data) {
        rejected.push({ rowNumber: r.rowNumber, errors: r.errors, raw: r.raw });
        continue;
      }
      toInsert.push({
        first_name: r.data.first_name,
        last_name: r.data.last_name,
        phone: r.data.phone,
        email: r.data.email ?? null,
        address_line1: r.data.address_line1,
        address_line2: r.data.address_line2 ?? null,
        city: r.data.city,
        province: r.data.province,
        postal_code: r.data.postal_code,
        notes: r.data.notes ?? null,
        lat: r.geocode?.lat ?? null,
        lng: r.geocode?.lng ?? null,
        created_by: admin.userId,
      });
    }
    const inserted = await insertSeniorsMany(supabase, toInsert);
    const errorCsv = buildErrorReport(rejected);
    return NextResponse.json({
      inserted,
      failed: rejected.length,
      errorCsv: errorCsv ? Buffer.from(errorCsv, "utf8").toString("base64") : null,
    });
  }

  return NextResponse.json({ error: "invalid step" }, { status: 400 });
}
