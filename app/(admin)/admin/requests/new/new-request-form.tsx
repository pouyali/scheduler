"use client";

import { useState, useTransition } from "react";
import { SeniorPicker } from "./senior-picker";
import { createRequestAction, type CreateResult } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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
      <div className="space-y-1.5">
        <Label>Senior</Label>
        <SeniorPicker />
        {errors.senior_id && (
          <p className="text-sm italic text-muted-foreground">{errors.senior_id}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="category">Category</Label>
        <select
          id="category"
          name="category"
          className="flex h-9 w-full rounded-[var(--radius)] border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:shadow-[var(--shadow-focus)]"
        >
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
        {errors.category && (
          <p className="text-sm italic text-muted-foreground">{errors.category}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="priority">Priority</Label>
        <select
          id="priority"
          name="priority"
          defaultValue="normal"
          className="flex h-9 w-full rounded-[var(--radius)] border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:shadow-[var(--shadow-focus)]"
        >
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="requested_date">Requested date</Label>
        <Input
          id="requested_date"
          type="date"
          name="requested_date"
        />
        {errors.requested_date && (
          <p className="text-sm italic text-muted-foreground">{errors.requested_date}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          rows={4}
        />
      </div>

      {formError && <p className="text-sm italic text-muted-foreground">{formError}</p>}

      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create request"}
      </Button>
    </form>
  );
}
