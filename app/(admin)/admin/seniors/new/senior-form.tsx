"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { PROVINCES } from "@/lib/constants/provinces";
import { createSenior } from "../actions";

export function SeniorForm() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [province, setProvince] = useState("BC");

  return (
    <form
      action={(fd) => {
        setError(null);
        fd.set("province", province);
        startTransition(async () => {
          try {
            await createSenior(fd);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to save");
          }
        });
      }}
      className="grid max-w-xl gap-4"
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" name="first_name" required />
        <Field label="Last name" name="last_name" required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Phone" name="phone" placeholder="(604) 555-0134" required />
        <Field label="Email" name="email" type="email" />
      </div>
      <Field label="Address line 1" name="address_line1" required />
      <Field label="Address line 2" name="address_line2" />
      <div className="grid grid-cols-3 gap-3">
        <Field label="City" name="city" required />
        <div>
          <Label>Province</Label>
          <Select value={province} onValueChange={setProvince}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROVINCES.map((p) => (
                <SelectItem key={p.code} value={p.code}>
                  {p.code} — {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Field label="Postal code" name="postal_code" placeholder="V6E 1B9" required />
      </div>
      <div>
        <Label>Notes</Label>
        <Textarea name="notes" />
      </div>
      {error ? <p className="text-sm text-muted-foreground italic">{error}</p> : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Create senior"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  placeholder,
  required,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} placeholder={placeholder} required={required} />
    </div>
  );
}
