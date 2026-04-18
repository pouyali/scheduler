import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

export type StubMap = Record<
  string,
  { features: Array<{ center: [number, number]; place_name: string }> }
>;

export function makeMapboxServer(stubs: StubMap) {
  return setupServer(
    http.get("https://api.mapbox.com/geocoding/v5/mapbox.places/:query.json", ({ params }) => {
      const raw = decodeURIComponent(params.query as string);
      const hit = stubs[raw] ?? stubs[Object.keys(stubs).find((k) => raw.includes(k)) ?? "__none__"];
      return HttpResponse.json(hit ?? { features: [] });
    }),
  );
}
