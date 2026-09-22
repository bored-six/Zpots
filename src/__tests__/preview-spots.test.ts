import { describe, expect, it } from "vitest";

import { isInsideCityOutline } from "@/lib/city-outline";
import { haversineMeters } from "@/lib/geo";
import {
  isPreviewSpot,
  PREVIEW_AUTHOR,
  PREVIEW_SPOTS,
  previewBounds,
  previewCards,
  previewMapSpots,
} from "@/lib/preview-spots";
import { isConfirmed } from "@/lib/spots";

/**
 * Preview spots: a curated set of famous Zamboanga City places, shown on
 * the Famosos lane and, when there is nothing real to show yet, as the
 * Paseo deck and Mi mapa empty-state fallback. They are client-side
 * constants (the DB's photo_url CHECK only allows the spot-photos
 * bucket), so this contract is the only thing keeping them honest.
 */
describe("PREVIEW_SPOTS -- data contract", () => {
  // Raised from 3-8: that range was written when this set was only an
  // empty-state fallback. Famosos is now a browsable lane in its own
  // right, so the cap widens to fit a curated city-wide set of famous
  // places while still forbidding a full city directory.
  it("has a curated set of spots, not one and not a whole city directory", () => {
    expect(PREVIEW_SPOTS.length).toBeGreaterThanOrEqual(3);
    expect(PREVIEW_SPOTS.length).toBeLessThanOrEqual(24);
  });

  // Grown to 20 for the Famosos lane, then dropped to 17 when Duyan Spot,
  // Muruk Haven and Yakan Weaving Village -- verified spots with no
  // freely-licensed photo -- were removed rather than shown as a flat
  // cream placeholder.
  it("has the full Famosos set of 17, after dropping photoless entries", () => {
    expect(PREVIEW_SPOTS.length).toBe(17);
  });

  it("every id is unique and carries the preview- prefix", () => {
    const ids = PREVIEW_SPOTS.map((spot) => spot.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^preview-[a-z0-9-]+$/);
  });

  it("every spot has a non-empty name and a short note", () => {
    for (const spot of PREVIEW_SPOTS) {
      expect(spot.name.trim().length).toBeGreaterThan(0);
      expect(spot.note.trim().length).toBeGreaterThan(0);
      expect(spot.note.length).toBeLessThanOrEqual(140);
    }
  });

  it("every spot sits inside the Zamboanga City outline polygon (not just the bbox)", () => {
    for (const spot of PREVIEW_SPOTS) {
      expect(isInsideCityOutline(spot.lat, spot.lng), `${spot.id} is outside the outline`).toBe(true);
    }
  });

  // The photoless spots (Duyan Spot, Muruk Haven, Yakan Weaving Village)
  // were removed rather than kept as a flat cream placeholder, so every
  // remaining entry now carries both an https photoUrl and a credit.
  it("has an https photo and a non-empty credit for every spot", () => {
    for (const spot of PREVIEW_SPOTS) {
      expect(spot.photoUrl).toMatch(/^https:\/\//);
      expect(spot.photoCredit?.trim().length ?? 0).toBeGreaterThan(0);
    }
  });

  it("has a photo and credit for Canelar Barter Trade Center", () => {
    const canelar = PREVIEW_SPOTS.find((spot) => spot.id === "preview-canelar-barter-trade-center");
    expect(canelar).toBeDefined();
    expect(canelar?.photoUrl).toBe(
      "https://upload.wikimedia.org/wikipedia/commons/b/be/Barter_goods_1022.jpg",
    );
    expect(canelar?.photoCredit).toBe("LuzViMindaLife, CC BY-SA 4.0, Wikimedia Commons");
  });

  it("is authored by the shared preview account, which is not a real profile", () => {
    expect(PREVIEW_AUTHOR.handle).toBe("zpots");
    for (const spot of PREVIEW_SPOTS) expect(spot.author).toEqual(PREVIEW_AUTHOR);
  });

  it("status is consistent with confirmations and createdAt is a valid ISO date", () => {
    for (const spot of PREVIEW_SPOTS) {
      expect(spot.status).toBe(isConfirmed(spot) ? "confirmed" : "unconfirmed");
      expect(Number.isInteger(spot.confirmations)).toBe(true);
      expect(spot.confirmations).toBeGreaterThanOrEqual(0);
      expect(new Date(spot.createdAt).toISOString()).toBe(spot.createdAt);
    }
  });

  it("includes Fort Pilar, the city's best-known landmark", () => {
    expect(PREVIEW_SPOTS.some((spot) => /fort pilar/i.test(spot.name))).toBe(true);
  });
});

describe("isPreviewSpot", () => {
  it("is true for every preview id and false for anything else", () => {
    for (const spot of PREVIEW_SPOTS) expect(isPreviewSpot(spot.id)).toBe(true);
    expect(isPreviewSpot("spot-1")).toBe(false);
    expect(isPreviewSpot("3f2504e0-4f89-11d3-9a0c-0305e82c3301")).toBe(false);
    expect(isPreviewSpot("")).toBe(false);
    expect(isPreviewSpot("preview")).toBe(false);
  });
});

describe("previewCards", () => {
  it("returns fresh copies with distanceM measured from the given origin", () => {
    const origin = { lat: 6.9106, lng: 122.0736 };
    const cards = previewCards(origin);

    expect(cards).toHaveLength(PREVIEW_SPOTS.length);
    for (const card of cards) {
      const source = PREVIEW_SPOTS.find((spot) => spot.id === card.id)!;
      expect(card.distanceM).toBeCloseTo(haversineMeters(origin, source), 3);
      expect(card).not.toBe(source);
    }
  });

  it("leaves distanceM undefined when no origin is given", () => {
    for (const card of previewCards()) expect(card.distanceM).toBeUndefined();
  });

  it("never mutates PREVIEW_SPOTS", () => {
    const before = JSON.stringify(PREVIEW_SPOTS);
    const cards = previewCards({ lat: 6.9, lng: 122.0 });
    cards[0].name = "mutated";
    cards[0].distanceM = -1;
    expect(JSON.stringify(PREVIEW_SPOTS)).toBe(before);
  });
});

describe("previewMapSpots", () => {
  it("tags every preview spot with source 'preview' so Mi mapa can tell them from real pins", () => {
    const mapSpots = previewMapSpots();
    expect(mapSpots).toHaveLength(PREVIEW_SPOTS.length);
    for (const spot of mapSpots) expect(spot.source).toBe("preview");
  });
});

describe("previewBounds", () => {
  it("is the tight [[south, west], [north, east]] box around every preview spot", async () => {
    const { previewBounds } = await import("@/lib/preview-spots");
    const [[south, west], [north, east]] = previewBounds();
    const lats = PREVIEW_SPOTS.map((spot) => spot.lat);
    const lngs = PREVIEW_SPOTS.map((spot) => spot.lng);

    expect(south).toBe(Math.min(...lats));
    expect(north).toBe(Math.max(...lats));
    expect(west).toBe(Math.min(...lngs));
    expect(east).toBe(Math.max(...lngs));
    expect(north).toBeGreaterThan(south);
    expect(east).toBeGreaterThan(west);
  });

  // The set now spans the whole city (Merloquet Falls in the north to
  // Great Santa Cruz Island in the south), not just downtown. previewBounds
  // still fits every entry rather than clamping to a downtown-only subset
  // -- Mi mapa's job is to show where the famous places actually are, and
  // SpotMap's fitBounds maxZoom cap already keeps a tight cluster from
  // landing at street level, so a wide fit costs nothing.
  it("fits the full city-wide spread rather than clamping to a downtown subset", () => {
    const [[south, west], [north, east]] = previewBounds();
    expect(north).toBeGreaterThan(7.0); // Merloquet Falls, 7.31066
    expect(east).toBeGreaterThan(122.2); // Once Islas, 122.26361
    expect(south).toBeLessThan(6.88); // Great Santa Cruz Island, 6.8735
    expect(west).toBeLessThan(122.03); // La Vista del Mar, 122.02019
  });
});
