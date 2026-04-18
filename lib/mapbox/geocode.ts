export type GeocodeResult =
  | { ok: true; lat: number; lng: number; placeName: string }
  | { ok: false; error: "not_found" | `http_${number}` | "invalid_response" };

export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  const token = process.env.MAPBOX_SECRET_TOKEN;
  if (!token) throw new Error("MAPBOX_SECRET_TOKEN not set");

  const url = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json`,
  );
  url.searchParams.set("access_token", token);
  url.searchParams.set("limit", "1");

  const res = await fetch(url);
  if (!res.ok) return { ok: false, error: `http_${res.status}` as const };

  const body = (await res.json()) as {
    features?: Array<{ center?: [number, number]; place_name?: string }>;
  };
  const feature = body.features?.[0];
  if (!feature) return { ok: false, error: "not_found" };
  if (!feature.center || feature.center.length !== 2 || !feature.place_name) {
    return { ok: false, error: "invalid_response" };
  }
  const [lng, lat] = feature.center;
  return { ok: true, lat, lng, placeName: feature.place_name };
}
