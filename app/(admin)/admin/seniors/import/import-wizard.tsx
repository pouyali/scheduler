"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type PreviewRow = {
  rowNumber: number;
  errors: string[];
  data: unknown;
  raw: Record<string, string>;
  geocode: { lat: number; lng: number } | null;
};
type PreviewResponse = {
  rows: PreviewRow[];
  summary: { total: number; valid: number; geocodeFailed: number; invalid: number };
};
type CommitResponse = {
  inserted: number;
  failed: number;
  errorCsv: string | null;
};

export function ImportWizard() {
  const [step, setStep] = useState<"upload" | "preview" | "done">("upload");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [confirmed, setConfirmed] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<CommitResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onUpload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("step", "preview");
      fd.set("file", file);
      const res = await fetch("/api/import/seniors", { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as PreviewResponse;
      const initial = new Set(
        data.rows.filter((r) => r.errors.length === 0).map((r) => r.rowNumber),
      );
      setPreview(data);
      setConfirmed(initial);
      setStep("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const toggle = (rowNumber: number) => {
    setConfirmed((prev) => {
      const next = new Set(prev);
      if (next.has(rowNumber)) next.delete(rowNumber);
      else next.add(rowNumber);
      return next;
    });
  };

  const uncheckGeocodeFailed = () => {
    if (!preview) return;
    setConfirmed((prev) => {
      const next = new Set(prev);
      for (const r of preview.rows) {
        if (r.errors.length === 0 && !r.geocode) next.delete(r.rowNumber);
      }
      return next;
    });
  };

  const onCommit = async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("step", "commit");
      fd.set(
        "payload",
        JSON.stringify({ rows: preview.rows, confirmed: Array.from(confirmed) }),
      );
      const res = await fetch("/api/import/seniors", { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as CommitResponse;
      setResult(data);
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Commit failed");
    } finally {
      setBusy(false);
    }
  };

  const downloadErrorCsv = () => {
    if (!result?.errorCsv) return;
    const blob = new Blob([atob(result.errorCsv)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "seniors-import-errors.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <ol className="flex gap-4 text-sm">
        <li className={step === "upload" ? "font-semibold" : "text-muted-foreground"}>1. Upload</li>
        <li className={step === "preview" ? "font-semibold" : "text-muted-foreground"}>2. Preview</li>
        <li className={step === "done" ? "font-semibold" : "text-muted-foreground"}>3. Result</li>
      </ol>

      {error ? <p className="text-sm text-muted-foreground italic">{error}</p> : null}

      {step === "upload" ? (
        <div className="space-y-3">
          <a
            href="/templates/seniors-import.csv"
            className="text-sm underline"
            download
          >
            Download template
          </a>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onUpload(f);
            }}
            disabled={busy}
          />
        </div>
      ) : null}

      {step === "preview" && preview ? (
        <div className="space-y-3">
          <p className="text-sm">
            {preview.summary.valid} will import • {preview.summary.geocodeFailed} with no coordinates •{" "}
            {preview.summary.invalid} rejected
          </p>
          <Button variant="outline" size="sm" onClick={uncheckGeocodeFailed}>
            Uncheck all geocode-failed rows
          </Button>
          <table className="w-full border-collapse text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-2">Include</th>
                <th>Row</th>
                <th>Name</th>
                <th>Address</th>
                <th>Status</th>
                <th>Errors</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((r) => {
                const isValid = r.errors.length === 0;
                const isGeoFail = isValid && !r.geocode;
                return (
                  <tr
                    key={r.rowNumber}
                    className={isGeoFail || !isValid ? "bg-muted" : ""}
                  >
                    <td className="py-1">
                      <input
                        type="checkbox"
                        disabled={!isValid}
                        checked={confirmed.has(r.rowNumber)}
                        onChange={() => toggle(r.rowNumber)}
                      />
                    </td>
                    <td>{r.rowNumber}</td>
                    <td>
                      {r.raw.first_name} {r.raw.last_name}
                    </td>
                    <td>
                      {r.raw.address_line1}, {r.raw.city}
                    </td>
                    <td>
                      {!isValid ? "✗ invalid" : isGeoFail ? "⚠ no coords" : "✓ geocoded"}
                    </td>
                    <td className="text-xs">{r.errors.join("; ")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setStep("upload")} disabled={busy}>
              Back
            </Button>
            <Button onClick={onCommit} disabled={busy || confirmed.size === 0}>
              Import {confirmed.size} row(s)
            </Button>
          </div>
        </div>
      ) : null}

      {step === "done" && result ? (
        <div className="space-y-2">
          <p className="text-sm">
            Imported {result.inserted}. {result.failed > 0 ? `${result.failed} failed.` : ""}
          </p>
          {result.errorCsv ? (
            <Button variant="outline" onClick={downloadErrorCsv}>
              Download error report
            </Button>
          ) : null}
          <div>
            <Link href="/admin/seniors" className="text-sm underline">
              Back to seniors list
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
