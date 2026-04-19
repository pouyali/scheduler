"use client";

import { useState, useEffect } from "react";

type Senior = { id: string; first_name: string; last_name: string; city: string };

export function SeniorPicker({ onSelect }: { onSelect?: (s: Senior) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Senior[]>([]);
  const [selected, setSelected] = useState<Senior | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      const res = await fetch(`/api/seniors/search?q=${encodeURIComponent(q)}`, {
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
      <div className="flex items-center justify-between rounded border p-3">
        <span>
          {selected.first_name} {selected.last_name} · {selected.city}
        </span>
        <button
          type="button"
          onClick={() => {
            setSelected(null);
            setQ("");
          }}
          className="text-blue-600 underline text-sm"
        >
          Change
        </button>
        <input type="hidden" name="senior_id" value={selected.id} />
      </div>
    );
  }

  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search seniors by name or phone…"
        className="w-full rounded border px-3 py-2"
        aria-label="Senior search"
      />
      {results.length > 0 && (
        <ul className="mt-1 max-h-60 overflow-auto rounded border">
          {results.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => {
                  setSelected(s);
                  onSelect?.(s);
                }}
                className="block w-full px-3 py-2 text-left hover:bg-gray-100"
              >
                {s.first_name} {s.last_name}{" "}
                <span className="text-gray-500">· {s.city}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
