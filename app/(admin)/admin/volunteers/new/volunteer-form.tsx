"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createVolunteerAction, type CreateVolunteerState } from "../actions";

type Category = { slug: string; name: string };

export function VolunteerForm({ categories }: { categories: Category[] }) {
  const [state, formAction, pending] = useActionState<CreateVolunteerState, FormData>(
    createVolunteerAction,
    undefined,
  );

  const fieldError = (k: string) => state?.fieldErrors?.[k];

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" id="first_name" error={fieldError("first_name")}>
          <Input id="first_name" name="first_name" required />
        </Field>
        <Field label="Last name" id="last_name" error={fieldError("last_name")}>
          <Input id="last_name" name="last_name" required />
        </Field>
      </div>
      <Field label="Email" id="email" error={fieldError("email")}>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </Field>
      <Field label="Phone (optional)" id="phone" error={fieldError("phone")}>
        <Input id="phone" name="phone" type="tel" />
      </Field>
      <Field label="Service area" id="service_area" error={fieldError("service_area")}>
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
      <div className="grid grid-cols-2 gap-3">
        <Field label="Home address (optional)" id="home_address">
          <Input id="home_address" name="home_address" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Lat (optional)" id="home_lat">
            <Input id="home_lat" name="home_lat" type="number" step="any" />
          </Field>
          <Field label="Lng (optional)" id="home_lng">
            <Input id="home_lng" name="home_lng" type="number" step="any" />
          </Field>
        </div>
      </div>
      {state?.error ? (
        <p className="text-sm italic text-muted-foreground">
          {state.error}
          {state.existingId ? (
            <>
              {" "}
              <Link
                href={`/admin/volunteers/${state.existingId}`}
                className="underline underline-offset-2"
              >
                Go to profile
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Inviting..." : "Create and send invite"}
        </Button>
        <Button asChild variant="outline">
          <Link href="/admin/volunteers">Cancel</Link>
        </Button>
      </div>
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
