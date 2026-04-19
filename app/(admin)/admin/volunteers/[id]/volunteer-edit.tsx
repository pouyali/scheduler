"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateVolunteerAction, type UpdateVolunteerState } from "../actions";

type Category = { slug: string; name: string; archived: boolean };

type Volunteer = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  categories: string[];
  service_area: string | null;
  home_address: string | null;
  home_lat: number | null;
  home_lng: number | null;
};

export function VolunteerEdit({
  volunteer,
  categories,
}: {
  volunteer: Volunteer;
  categories: Category[];
}) {
  const [state, formAction, pending] = useActionState<UpdateVolunteerState, FormData>(
    updateVolunteerAction.bind(null, volunteer.id),
    undefined,
  );

  const fieldError = (k: string) => state?.fieldErrors?.[k];
  const checked = new Set(volunteer.categories);

  return (
    <form action={formAction} className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Email ({volunteer.email}) is immutable. Contact support to change it.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" id="first_name" error={fieldError("first_name")}>
          <Input id="first_name" name="first_name" defaultValue={volunteer.first_name} required />
        </Field>
        <Field label="Last name" id="last_name" error={fieldError("last_name")}>
          <Input id="last_name" name="last_name" defaultValue={volunteer.last_name} required />
        </Field>
      </div>
      <Field label="Phone" id="phone" error={fieldError("phone")}>
        <Input id="phone" name="phone" type="tel" defaultValue={volunteer.phone ?? ""} />
      </Field>
      <Field label="Service area" id="service_area" error={fieldError("service_area")}>
        <Input
          id="service_area"
          name="service_area"
          defaultValue={volunteer.service_area ?? ""}
          required
        />
      </Field>
      <fieldset>
        <legend className="mb-2 text-sm font-normal text-foreground">Categories</legend>
        <div className="flex flex-wrap gap-3">
          {categories
            .filter((c) => !c.archived || checked.has(c.slug))
            .map((c) => (
              <label key={c.slug} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="categories"
                  value={c.slug}
                  defaultChecked={checked.has(c.slug)}
                />
                {c.name}
                {c.archived ? (
                  <span className="text-xs italic text-muted-foreground">(archived)</span>
                ) : null}
              </label>
            ))}
        </div>
        {fieldError("categories") ? (
          <p className="mt-1 text-sm italic text-muted-foreground">{fieldError("categories")}</p>
        ) : null}
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Home address" id="home_address">
          <Input id="home_address" name="home_address" defaultValue={volunteer.home_address ?? ""} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Lat" id="home_lat">
            <Input
              id="home_lat"
              name="home_lat"
              type="number"
              step="any"
              defaultValue={volunteer.home_lat ?? ""}
            />
          </Field>
          <Field label="Lng" id="home_lng">
            <Input
              id="home_lng"
              name="home_lng"
              type="number"
              step="any"
              defaultValue={volunteer.home_lng ?? ""}
            />
          </Field>
        </div>
      </div>
      {state?.error ? (
        <p className="text-sm italic text-muted-foreground">{state.error}</p>
      ) : null}
      {state?.ok ? (
        <p className="text-sm text-muted-foreground">Saved.</p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving..." : "Save changes"}
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
