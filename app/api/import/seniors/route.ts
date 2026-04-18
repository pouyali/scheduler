import { NextResponse } from "next/server";
import pMap from "p-map";
import { requireAdmin } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseSeniorsCsv, type ParsedRow } from "@/lib/csv/parse-seniors";
import { buildErrorReport } from "@/lib/csv/error-report";
import { geocodeAddress } from "@/lib/mapbox/geocode";
import { insertSeniorsMany } from "@/lib/db/queries/seniors";
import { seniorRowSchema } from "@/lib/validations/seniors";

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
    let parsed: { rows: PreviewRow[]; confirmed: number[] };
    try {
      parsed = JSON.parse(payload) as { rows: PreviewRow[]; confirmed: number[] };
    } catch {
      return NextResponse.json({ error: "invalid payload JSON" }, { status: 400 });
    }
    if (!Array.isArray(parsed.rows) || !Array.isArray(parsed.confirmed)) {
      return NextResponse.json({ error: "payload shape invalid" }, { status: 400 });
    }
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

      // Re-validate every confirmed row server-side. Never trust the client payload.
      const revalidate = seniorRowSchema.safeParse(r.raw);
      if (!revalidate.success) {
        const errors = revalidate.error.issues.map(
          (iss) => `${iss.path.join(".") || "row"}: ${iss.message}`,
        );
        rejected.push({ rowNumber: r.rowNumber, errors, raw: r.raw });
        continue;
      }
      const data = revalidate.data;

      toInsert.push({
        first_name: data.first_name,
        last_name: data.last_name,
        phone: data.phone,
        email: data.email ?? null,
        address_line1: data.address_line1,
        address_line2: data.address_line2 ?? null,
        city: data.city,
        province: data.province,
        postal_code: data.postal_code,
        notes: data.notes ?? null,
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
