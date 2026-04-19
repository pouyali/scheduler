"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function DevTools() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const seed = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await fetch("/api/dev/seed", { method: "POST" });
      const body = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok) {
        setMessage(`Failed: ${body.error ?? r.statusText}`);
      } else {
        setMessage("Seeded.");
      }
    } catch (e) {
      setMessage(`Failed: ${e instanceof Error ? e.message : "network error"}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-8 rounded-[var(--radius-lg)] border border-border p-4">
      <h3 className="text-sm font-semibold">Dev tools</h3>
      <p className="text-muted-foreground mt-1 text-xs">
        Visible only when NODE_ENV !== production AND NEXT_PUBLIC_ENABLE_DEV_TOOLS=true. Must be
        removed before shipping Phase 1.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <Button variant="outline" onClick={seed} disabled={busy}>
          {busy ? "Seeding..." : "Seed test data"}
        </Button>
        {message ? <span className="text-muted-foreground text-xs">{message}</span> : null}
      </div>
    </section>
  );
}
