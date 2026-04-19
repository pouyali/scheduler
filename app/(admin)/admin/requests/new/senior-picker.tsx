"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Senior = { id: string; first_name: string; last_name: string; city: string };

export function SeniorPicker({ onSelect }: { onSelect?: (s: Senior) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Senior[]>([]);
  const [selected, setSelected] = useState<Senior | null>(null);

  useEffect(() => {
    const query = q.trim();
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      if (query.length < 2) {
        setResults([]);
        return;
      }
      const res = await fetch(`/api/seniors/search?q=${encodeURIComponent(query)}`, {
        signal: ctrl.signal,
      });
      if (!res.ok) return;
      setResults(await res.json());
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  if (selected) {
    return (
      <div className="flex items-center justify-between rounded-[var(--radius)] border border-border px-3 py-2">
        <span className="text-sm">
          {selected.first_name} {selected.last_name} · {selected.city}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setSelected(null);
            setQ("");
          }}
        >
          Change
        </Button>
        <input type="hidden" name="senior_id" value={selected.id} />
      </div>
    );
  }

  return (
    <div>
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search seniors by name or phone…"
        aria-label="Senior search"
      />
      {results.length > 0 && (
        <ul className="mt-1 max-h-60 overflow-auto rounded-[var(--radius)] border border-border">
          {results.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => {
                  setSelected(s);
                  onSelect?.(s);
                }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
              >
                {s.first_name} {s.last_name}{" "}
                <span className="text-muted-foreground">· {s.city}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
