"use client";

import { useState, useTransition } from "react";
import { SeniorPicker } from "./senior-picker";
import { createRequestAction, type CreateResult } from "./actions";

export function NewRequestForm({ categories }: { categories: { slug: string; name: string }[] }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function onSubmit(fd: FormData) {
    setErrors({});
    setFormError(null);
    startTransition(async () => {
      const result: CreateResult = await createRequestAction(fd);
      if (!result.ok) {
        setErrors(result.fieldErrors);
        if (result.formError) setFormError(result.formError);
      }
    });
  }

  return (
    <form action={onSubmit} className="space-y-4">
      <label className="block">
        <span className="text-sm font-medium">Senior</span>
        <SeniorPicker />
        {errors.senior_id && (
          <p className="text-sm text-red-600">{errors.senior_id}</p>
        )}
      </label>

      <label className="block">
        <span className="text-sm font-medium">Category</span>
        <select name="category" className="w-full rounded border px-3 py-2">
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
        {errors.category && (
          <p className="text-sm text-red-600">{errors.category}</p>
        )}
      </label>

      <label className="block">
        <span className="text-sm font-medium">Priority</span>
        <select
          name="priority"
          defaultValue="normal"
          className="w-full rounded border px-3 py-2"
        >
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
        </select>
      </label>

      <label className="block">
        <span className="text-sm font-medium">Requested date</span>
        <input
          type="date"
          name="requested_date"
          className="w-full rounded border px-3 py-2"
        />
        {errors.requested_date && (
          <p className="text-sm text-red-600">{errors.requested_date}</p>
        )}
      </label>

      <label className="block">
        <span className="text-sm font-medium">Description</span>
        <textarea
          name="description"
          rows={4}
          className="w-full rounded border px-3 py-2"
        />
      </label>

      {formError && <p className="text-sm text-red-600">{formError}</p>}

      <button
        disabled={pending}
        className="rounded bg-black px-4 py-2 text-sm font-medium text-white"
      >
        {pending ? "Creating…" : "Create request"}
      </button>
    </form>
  );
}
