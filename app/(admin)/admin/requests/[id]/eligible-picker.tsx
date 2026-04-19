"use client";

import { useState, useTransition } from "react";
import type { RankedVolunteer } from "@/lib/matching/eligibility";
import { sendInvitesAction } from "./actions";

export function EligiblePicker({
  requestId, volunteers,
}: { requestId: string; volunteers: RankedVolunteer[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const selectAllInArea = () => setSelected(new Set(volunteers.filter(v => v.inArea).map(v => v.id)));
  const selectAll = () => setSelected(new Set(volunteers.map(v => v.id)));
  const clear = () => setSelected(new Set());

  async function send() {
    setError(null);
    const ids = [...selected];
    if (ids.length === 0) { setError("Pick at least one volunteer."); return; }
    const confirmed = ids.length > 25 ? window.confirm(`You're about to email ${ids.length} volunteers. Continue?`) : true;
    if (!confirmed) return;
    startTransition(async () => {
      try {
        await sendInvitesAction({ requestId, volunteerIds: ids, confirmed: ids.length > 25 });
        setSelected(new Set());
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Eligible volunteers</h2>
      <div className="flex gap-2 text-sm">
        <button type="button" onClick={selectAllInArea} className="underline">Select all in-area</button>
        <button type="button" onClick={selectAll} className="underline">Select all</button>
        <button type="button" onClick={clear} className="underline">Clear</button>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-gray-500">
          <tr><th></th><th>Name</th><th>Area</th><th>Categories</th></tr>
        </thead>
        <tbody>
          {volunteers.map(v => (
            <tr key={v.id} className="border-t">
              <td><input type="checkbox" checked={selected.has(v.id)} onChange={() => toggle(v.id)} /></td>
              <td>{v.first_name} {v.last_name}</td>
              <td>
                {v.service_area}
                {v.inArea && <span className="ml-1 rounded bg-green-100 px-1 text-xs text-green-800">in-area</span>}
              </td>
              <td>{v.categories.join(", ")}</td>
            </tr>
          ))}
          {volunteers.length === 0 && (
            <tr><td colSpan={4} className="py-6 text-center text-gray-500">No eligible volunteers.</td></tr>
          )}
        </tbody>
      </table>
      <div className="flex items-center gap-3">
        <button
          type="button" disabled={pending || selected.size === 0} onClick={send}
          className="rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Sending…" : `Send to ${selected.size} volunteer${selected.size === 1 ? "" : "s"}`}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </section>
  );
}
