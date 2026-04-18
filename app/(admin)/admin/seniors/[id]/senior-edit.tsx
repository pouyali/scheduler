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
import { MapView, type MapPin } from "@/components/map/MapView";
import { PROVINCES } from "@/lib/constants/provinces";
import { updateSenior } from "../actions";

type Senior = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
  address_line1: string;
  address_line2: string | null;
  city: string;
  province: string;
  postal_code: string;
  notes: string | null;
  lat: number | null;
  lng: number | null;
};

export function SeniorEdit({ senior }: { senior: Senior }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [province, setProvince] = useState(senior.province);
  const [lat, setLat] = useState<number | null>(senior.lat);
  const [lng, setLng] = useState<number | null>(senior.lng);
  const [manualOverride, setManualOverride] = useState(false);

  const pins: MapPin[] =
    lat != null && lng != null
      ? [{ id: senior.id, lat, lng }]
      : [];

  return (
    <form
      action={(fd) => {
        setError(null);
        fd.set("province", province);
        if (lat != null) fd.set("lat", String(lat));
        if (lng != null) fd.set("lng", String(lng));
        fd.set("manual_pin_override", manualOverride ? "true" : "false");
        startTransition(async () => {
          try {
            await updateSenior(senior.id, fd);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to save");
          }
        });
      }}
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
    >
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" name="first_name" defaultValue={senior.first_name} required />
          <Field label="Last name" name="last_name" defaultValue={senior.last_name} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone" name="phone" defaultValue={senior.phone} required />
          <Field label="Email" name="email" defaultValue={senior.email ?? ""} />
        </div>
        <Field
          label="Address line 1"
          name="address_line1"
          defaultValue={senior.address_line1}
          required
        />
        <Field
          label="Address line 2"
          name="address_line2"
          defaultValue={senior.address_line2 ?? ""}
        />
        <div className="grid grid-cols-3 gap-3">
          <Field label="City" name="city" defaultValue={senior.city} required />
          <div>
            <Label>Province</Label>
            <Select value={province} onValueChange={setProvince}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVINCES.map((p) => (
                  <SelectItem key={p.code} value={p.code}>
                    {p.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Field
            label="Postal code"
            name="postal_code"
            defaultValue={senior.postal_code}
            required
          />
        </div>
        <div>
          <Label>Notes</Label>
          <Textarea name="notes" defaultValue={senior.notes ?? ""} />
        </div>
      </div>

      <div className="grid gap-2">
        <Label>Location</Label>
        {pins.length > 0 ? null : (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Not geocoded. Enter coordinates manually or use &ldquo;Drop pin at map center&rdquo; below.
          </p>
        )}
        <MapView
          pins={pins}
          draggable
          className="h-80 w-full rounded-md border"
          initialCenter={lat != null && lng != null ? [lng, lat] : undefined}
          initialZoom={lat != null && lng != null ? 14 : 10}
          onPinDrag={(newLat, newLng) => {
            setLat(newLat);
            setLng(newLng);
            setManualOverride(true);
          }}
        />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Latitude</Label>
            <Input
              type="number"
              step="any"
              value={lat ?? ""}
              onChange={(e) => {
                setLat(e.target.value === "" ? null : Number(e.target.value));
                setManualOverride(true);
              }}
            />
          </div>
          <div>
            <Label>Longitude</Label>
            <Input
              type="number"
              step="any"
              value={lng ?? ""}
              onChange={(e) => {
                setLng(e.target.value === "" ? null : Number(e.target.value));
                setManualOverride(true);
              }}
            />
          </div>
        </div>
      </div>

      <div className="col-span-full flex items-center justify-end gap-2 border-t pt-4">
        {error ? <p className="mr-auto text-sm text-red-600">{error}</p> : null}
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  defaultValue,
  required,
  type = "text",
}: {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} defaultValue={defaultValue} required={required} />
    </div>
  );
}
