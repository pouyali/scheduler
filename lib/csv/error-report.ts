import Papa from "papaparse";

export type RejectedRow = {
  rowNumber: number;
  errors: string[];
  raw: Record<string, string>;
};

const COLUMNS = [
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

export function buildErrorReport(rejected: RejectedRow[]): string | null {
  if (rejected.length === 0) return null;
  const fields = [...COLUMNS, "error"] as const;
  const rows = rejected.map((r) => {
    const out: Record<string, string> = {};
    for (const c of COLUMNS) out[c] = r.raw[c] ?? "";
    out.error = r.errors.join("; ");
    return out;
  });
  return Papa.unparse({ fields: fields as unknown as string[], data: rows });
}
