import Papa from "papaparse";
import { seniorRowSchema, type SeniorRowInput } from "@/lib/validations/seniors";

export type ParsedRow =
  | { rowNumber: number; errors: []; data: SeniorRowInput; raw: Record<string, string> }
  | { rowNumber: number; errors: string[]; data: null; raw: Record<string, string> };

const REQUIRED_HEADERS = [
  "first_name",
  "last_name",
  "phone",
  "email",
  "address_line1",
  "address_line2",
  "city",
  "province",
  "postal_code",
  "notes",
] as const;

function isEmptyRow(row: Record<string, string>): boolean {
  return Object.values(row).every((v) => (v ?? "").toString().trim() === "");
}

export function parseSeniorsCsv(csv: string): ParsedRow[] {
  const stripped = csv.replace(/^\uFEFF/, "");
  const parsed = Papa.parse<Record<string, string>>(stripped, {
    header: true,
    skipEmptyLines: false,
    transformHeader: (h) => h.trim(),
  });

  const headers = parsed.meta.fields ?? [];
  for (const h of REQUIRED_HEADERS) {
    if (!headers.includes(h)) {
      throw new Error(`CSV header missing required column: ${h}`);
    }
  }

  const out: ParsedRow[] = [];
  parsed.data.forEach((row, i) => {
    const rowNumber = i + 2; // +1 for header, +1 for 1-based
    if (isEmptyRow(row)) return;

    const raw = Object.fromEntries(
      REQUIRED_HEADERS.map((h) => [h, (row[h] ?? "").toString()]),
    );
    const result = seniorRowSchema.safeParse(raw);
    if (result.success) {
      out.push({ rowNumber, errors: [], data: result.data, raw });
    } else {
      const errors = result.error.issues.map(
        (iss) => `${iss.path.join(".") || "row"}: ${iss.message}`,
      );
      out.push({ rowNumber, errors, data: null, raw });
    }
  });

  return out;
}
