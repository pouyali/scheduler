"use client";

import { useState, useTransition } from "react";
import { updateRequestAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { splitIsoToDateTime, combineDateTimeToIso } from "@/lib/service-requests/datetime";

type Props = {
  requestId: string;
  locked: boolean;
  defaults: { category: string; priority: "low" | "normal" | "high"; requested_at: string; description: string | null };
  categories: { slug: string; name: string }[];
};

export function EditForm({ requestId, locked, defaults, categories }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const { date: defaultDate, time: defaultTime } = splitIsoToDateTime(defaults.requested_at);

  async function onSubmit(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const payload: Record<string, unknown> = Object.fromEntries(fd.entries());
      if (locked) {
        delete payload.requested_date;
        delete payload.requested_time;
        delete payload.requested_at;
      } else if (payload.requested_date && payload.requested_time) {
        payload.requested_at = combineDateTimeToIso(
          String(payload.requested_date),
          String(payload.requested_time),
        );
        delete payload.requested_date;
        delete payload.requested_time;
      }
      const res = await updateRequestAction(requestId, payload);
      if (res && !res.ok) setError(res.error);
    });
  }

  return (
    <form action={onSubmit} className="space-y-4">
      {locked && (
        <p className="rounded-[var(--radius)] border border-border bg-muted p-3 text-sm text-muted-foreground">
          This request is currently notified. Category, date, and senior are locked. Cancel the request to change them.
        </p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="edit-category">Category</Label>
        <select
          id="edit-category"
          name="category"
          defaultValue={defaults.category}
          disabled={locked}
          className="flex h-9 w-full rounded-[var(--radius)] border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:shadow-[var(--shadow-focus)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {categories.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="edit-priority">Priority</Label>
        <select
          id="edit-priority"
          name="priority"
          defaultValue={defaults.priority}
          className="flex h-9 w-full rounded-[var(--radius)] border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:shadow-[var(--shadow-focus)]"
        >
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="requested_date">Date</Label>
          <Input id="requested_date" type="date" name="requested_date" defaultValue={defaultDate} disabled={locked} />
        </div>
        <div>
          <Label htmlFor="requested_time">Time</Label>
          <Input id="requested_time" type="time" name="requested_time" step={900} defaultValue={defaultTime} disabled={locked} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="edit-description">Description</Label>
        <Textarea
          id="edit-description"
          name="description"
          defaultValue={defaults.description ?? ""}
          rows={4}
        />
      </div>

      {error && <p className="text-sm italic text-muted-foreground">{error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
