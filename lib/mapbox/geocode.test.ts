import { describe, it, expect, vi, beforeEach } from "vitest";
import { geocodeAddress } from "@/lib/mapbox/geocode";

describe("geocodeAddress", () => {
  const originalEnv = process.env;
  beforeEach(() => {
    process.env = { ...originalEnv, MAPBOX_SECRET_TOKEN: "sk.test" };
    vi.restoreAllMocks();
  });

  it("returns lat/lng on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            features: [{ center: [-79.38, 43.65], place_name: "Toronto, ON" }],
          }),
          { status: 200 },
        ),
      ),
    );
    const result = await geocodeAddress("100 Queen St W, Toronto, ON");
    expect(result).toEqual({ ok: true, lat: 43.65, lng: -79.38, placeName: "Toronto, ON" });
  });

  it("returns not_found when no features", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ features: [] }), { status: 200 })),
    );
    const result = await geocodeAddress("nowhere");
    expect(result).toEqual({ ok: false, error: "not_found" });
  });

  it("returns error on non-200", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 500 })));
    const result = await geocodeAddress("x");
    expect(result).toEqual({ ok: false, error: "http_500" });
  });

  it("throws without token", async () => {
    delete process.env.MAPBOX_SECRET_TOKEN;
    await expect(geocodeAddress("x")).rejects.toThrow(/MAPBOX_SECRET_TOKEN/);
  });
});
