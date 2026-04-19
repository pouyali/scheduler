"use client";

import { useState, useTransition } from "react";
import type { RankedVolunteer } from "@/lib/matching/eligibility";
import { sendInvitesAction } from "./actions";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";

export function EligiblePicker({
  requestId, volunteers,
}: { requestId: string; volunteers: RankedVolunteer[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={selectAllInArea}>Select all in-area</Button>
        <Button type="button" variant="outline" size="sm" onClick={selectAll}>Select all</Button>
        <Button type="button" variant="ghost" size="sm" onClick={clear}>Clear</Button>
      </div>
      <table className="w-full border-collapse text-sm">
        <thead className="text-left text-xs uppercase text-muted-foreground">
          <tr className="border-b border-border"><th></th><th className="py-2">Name</th><th>Area</th><th>Categories</th></tr>
        </thead>
        <tbody>
          {volunteers.map(v => (
            <tr key={v.id} className="border-t hover:bg-muted">
              <td className="py-2"><input type="checkbox" checked={selected.has(v.id)} onChange={() => toggle(v.id)} /></td>
              <td>{v.first_name} {v.last_name}</td>
              <td className="space-x-1">
                <span>{v.service_area}</span>
                {v.inArea && <StatusBadge variant="in-area">in-area</StatusBadge>}
              </td>
              <td>{v.categories.join(", ")}</td>
            </tr>
          ))}
          {volunteers.length === 0 && (
            <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">No eligible volunteers.</td></tr>
          )}
        </tbody>
      </table>
      <div className="flex items-center gap-3">
        <Button
          type="button"
          disabled={pending || selected.size === 0}
          onClick={send}
        >
          {pending ? "Sending…" : `Send to ${selected.size} volunteer${selected.size === 1 ? "" : "s"}`}
        </Button>
        {error && <p className="text-sm italic text-muted-foreground">{error}</p>}
      </div>
    </section>
  );
}
