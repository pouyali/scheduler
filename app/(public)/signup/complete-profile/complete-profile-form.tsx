"use client";

import { useActionState } from "react";
import { completeProfileAction, type CompleteProfileState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Category = { slug: string; name: string };

export function CompleteProfileForm({ categories }: { categories: Category[] }) {
  const [state, formAction, pending] = useActionState<CompleteProfileState, FormData>(
    completeProfileAction,
    undefined,
  );
  const fieldError = (k: string) => state?.fieldErrors?.[k];

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Field label="First name" id="first_name" error={fieldError("first_name")}>
          <Input id="first_name" name="first_name" required />
        </Field>
        <Field label="Last name" id="last_name" error={fieldError("last_name")}>
          <Input id="last_name" name="last_name" required />
        </Field>
      </div>
      <Field label="Phone (optional)" id="phone" error={fieldError("phone")}>
        <Input id="phone" name="phone" type="tel" />
      </Field>
      <Field label="Service area (city)" id="service_area" error={fieldError("service_area")}>
        <Input id="service_area" name="service_area" required />
      </Field>
      <fieldset>
        <legend className="mb-2 text-sm font-normal text-foreground">Categories</legend>
        <div className="flex flex-wrap gap-3">
          {categories.map((c) => (
            <label key={c.slug} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="categories" value={c.slug} />
              {c.name}
            </label>
          ))}
        </div>
        {fieldError("categories") ? (
          <p className="mt-1 text-sm italic text-muted-foreground">{fieldError("categories")}</p>
        ) : null}
      </fieldset>
      {state?.error ? (
        <p className="text-sm italic text-muted-foreground">{state.error}</p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Saving..." : "Save and continue"}
      </Button>
    </form>
  );
}

function Field({
  label,
  id,
  error,
  children,
}: {
  label: string;
  id: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? <p className="text-sm italic text-muted-foreground">{error}</p> : null}
    </div>
  );
}
