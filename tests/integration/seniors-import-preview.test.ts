import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseSeniorsCsv } from "@/lib/csv/parse-seniors";
import { geocodeAddress } from "@/lib/mapbox/geocode";
import { makeMapboxServer } from "./msw-mapbox";

const fixturePath = path.resolve(__dirname, "../fixtures/seniors-mixed.csv");

const server = makeMapboxServer({
  "1245 Robson St": {
    features: [{ center: [-123.1265, 49.2845], place_name: "1245 Robson St, Vancouver" }],
  },
  "900 W Georgia St": {
    features: [{ center: [-123.1197, 49.2827], place_name: "900 W Georgia St, Vancouver" }],
  },
  "800 Hornby St": {
    features: [{ center: [-123.1232, 49.2807], place_name: "800 Hornby St, Vancouver" }],
  },
  "Unreachable": { features: [] },
});

beforeAll(() => {
  process.env.MAPBOX_SECRET_TOKEN = "sk.test";
  server.listen();
});
afterAll(() => server.close());

describe("CSV import preview logic", () => {
  it("classifies rows into valid, geocode-failed, and invalid", async () => {
    const csv = readFileSync(fixturePath, "utf8");
    const parsed = parseSeniorsCsv(csv);

    const results = await Promise.all(
      parsed.map(async (r) => {
        if (r.errors.length > 0) return { ...r, geocode: null as { lat: number; lng: number } | null };
        const full = `${r.data.address_line1}, ${r.data.city}, ${r.data.province}, ${r.data.postal_code}, Canada`;
        const geo = await geocodeAddress(full);
        return {
          ...r,
          geocode: geo.ok ? { lat: geo.lat, lng: geo.lng } : null,
        };
      }),
    );

    const valid = results.filter((r) => r.errors.length === 0 && r.geocode);
    const warning = results.filter((r) => r.errors.length === 0 && !r.geocode);
    const invalid = results.filter((r) => r.errors.length > 0);

    expect(valid).toHaveLength(3);
    expect(warning).toHaveLength(1);
    expect(invalid).toHaveLength(2);
    expect(invalid[0].errors.join(",")).toMatch(/first_name/);
    expect(invalid[1].errors.join(",")).toMatch(/phone/);
  });
});
