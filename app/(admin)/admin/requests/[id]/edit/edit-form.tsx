"use client";

import { useState, useTransition } from "react";
import { updateRequestAction } from "./actions";

type Props = {
  requestId: string;
  locked: boolean;
  defaults: { category: string; priority: "low" | "normal" | "high"; requested_date: string; description: string | null };
  categories: string[];
};

export function EditForm({ requestId, locked, defaults, categories }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function onSubmit(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const payload = locked
        ? { priority: fd.get("priority"), description: fd.get("description") }
        : Object.fromEntries(fd.entries());
      const res = await updateRequestAction(requestId, payload);
      if (res && !res.ok) setError(res.error);
    });
  }

  return (
    <form action={onSubmit} className="space-y-4">
      {locked && (
        <p className="rounded bg-amber-50 p-3 text-sm text-amber-900">
          This request is currently notified. Category, date, and senior are locked. Cancel the request to change them.
        </p>
      )}
      <label className="block">
        <span className="text-sm font-medium">Category</span>
        <select name="category" defaultValue={defaults.category} disabled={locked} className="w-full rounded border px-3 py-2 disabled:bg-gray-100">
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>

      <label className="block">
        <span className="text-sm font-medium">Priority</span>
        <select name="priority" defaultValue={defaults.priority} className="w-full rounded border px-3 py-2">
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
        </select>
      </label>

      <label className="block">
        <span className="text-sm font-medium">Requested date</span>
        <input type="date" name="requested_date" defaultValue={defaults.requested_date} disabled={locked}
          className="w-full rounded border px-3 py-2 disabled:bg-gray-100" />
      </label>

      <label className="block">
        <span className="text-sm font-medium">Description</span>
        <textarea name="description" defaultValue={defaults.description ?? ""} rows={4} className="w-full rounded border px-3 py-2" />
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button disabled={pending} className="rounded bg-black px-4 py-2 text-sm font-medium text-white">
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
