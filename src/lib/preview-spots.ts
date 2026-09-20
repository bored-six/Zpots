import { haversineMeters, type LatLng } from "@/lib/geo";
import type { MapSpot, SpotAuthor, SpotCard } from "@/lib/spots";

/**
 * Preview spots: a handful of famous Zamboanga City places, shown in the
 * Paseo deck and on Mi mapa only when there is nothing real to show yet,
 * so a brand-new visitor sees what the app is for before anyone has
 * dropped a pin.
 *
 * They are client-side constants, never database rows: the `spots`
 * table's photo_url CHECK only accepts the spot-photos bucket, and a
 * preview must never be saveable, confirmable, or reportable (its id does
 * not exist server-side). Every consumer tells a preview apart by its id
 * prefix (`isPreviewSpot`) or, on the map, by `source: "preview"`.
 *
 * Photos are hot-linked from Wikimedia Commons under CC BY-SA and carry
 * their attribution in `photoCredit`, which the card and popup render.
 */
const PREVIEW_ID_PREFIX = "preview-";

export const PREVIEW_AUTHOR: SpotAuthor = {
  id: "preview-account",
  handle: "zpots",
  displayName: "Zpots",
  avatarUrl: null,
};

const PREVIEW_CREATED_AT = "2026-09-20T00:00:00.000Z";

const COMMONS = "https://upload.wikimedia.org/wikipedia/commons/thumb";

export const PREVIEW_SPOTS: readonly SpotCard[] = [
  {
    id: "preview-fort-pilar",
    name: "Fort Pilar",
    note: "The 1635 Spanish fort and the open-air shrine. Candles at dusk, museum inside.",
    lat: 6.90111,
    lng: 122.08222,
    status: "confirmed",
    confirmations: 2,
    createdAt: PREVIEW_CREATED_AT,
    author: PREVIEW_AUTHOR,
    photoUrl:
      `${COMMONS}/a/a7/Main_entrance_of_Fort_Pilar%2C_Zamboanga_City.jpg/` +
      "1280px-Main_entrance_of_Fort_Pilar%2C_Zamboanga_City.jpg",
    photoCredit: "Ralff Nestor Nacor, CC BY-SA 4.0, Wikimedia Commons",
  },
  {
    id: "preview-paseo-del-mar",
    name: "Paseo del Mar",
    note: "Bayside promenade next to the fort. Street food stalls, sea breeze, best after sunset.",
    lat: 6.9017,
    lng: 122.079,
    status: "confirmed",
    confirmations: 2,
    createdAt: PREVIEW_CREATED_AT,
    author: PREVIEW_AUTHOR,
    photoUrl:
      `${COMMONS}/0/06/View_of_Paseo_del_Mar%2C_Zamboanga_City%2C_Mar_2026.jpg/` +
      "1280px-View_of_Paseo_del_Mar%2C_Zamboanga_City%2C_Mar_2026.jpg",
    photoCredit: "Ralff Nestor Nacor, CC BY-SA 4.0, Wikimedia Commons",
  },
  {
    id: "preview-pasonanca-park",
    name: "Pasonanca Park",
    note: "The city's green lung since 1912. Look for the tree house and the swimming pools.",
    lat: 6.95334,
    lng: 122.07309,
    status: "confirmed",
    confirmations: 2,
    createdAt: PREVIEW_CREATED_AT,
    author: PREVIEW_AUTHOR,
    photoUrl:
      `${COMMONS}/f/f4/Pasonanca_Park_Tree_House_%28Pasonanca_Road%2C_Zamboanga_City%3B_10-09-2023%29.jpg/` +
      "1280px-Pasonanca_Park_Tree_House_%28Pasonanca_Road%2C_Zamboanga_City%3B_10-09-2023%29.jpg",
    photoCredit: "Patrickroque01, CC BY-SA 4.0, Wikimedia Commons",
  },
  {
    id: "preview-santa-cruz-island",
    name: "Great Santa Cruz Island",
    note: "Pink sand beach, a short boat ride from Paseo del Mar. Book at the tourism desk, mornings only.",
    lat: 6.8735,
    lng: 122.056,
    status: "confirmed",
    confirmations: 2,
    createdAt: PREVIEW_CREATED_AT,
    author: PREVIEW_AUTHOR,
    photoUrl:
      `${COMMONS}/2/22/Pink_Sands_and_Sandbars_of_Santa_Cruz_Islands%2C_Zamboanga_City_Philippines.jpg/` +
      "1280px-Pink_Sands_and_Sandbars_of_Santa_Cruz_Islands%2C_Zamboanga_City_Philippines.jpg",
    photoCredit: "Aldous Mariano Carino, CC BY-SA 4.0, Wikimedia Commons",
  },
  {
    id: "preview-plaza-pershing",
    name: "Plaza Pershing",
    note: "The old town square in front of City Hall. Sit under the trees and watch the city go by.",
    lat: 6.9058,
    lng: 122.0758,
    status: "confirmed",
    confirmations: 2,
    createdAt: PREVIEW_CREATED_AT,
    author: PREVIEW_AUTHOR,
    photoUrl:
      `${COMMONS}/2/27/Zamboanga_City_Hall%2C_Rizal_Park%2C_Plaza_Pershing_top_view_%28NS_Valderosa%2C_Zamboanga_City%3B_10-12-2023%29.jpg/` +
      "1280px-Zamboanga_City_Hall%2C_Rizal_Park%2C_Plaza_Pershing_top_view_%28NS_Valderosa%2C_Zamboanga_City%3B_10-12-2023%29.jpg",
    photoCredit: "Patrickroque01, CC BY-SA 4.0, Wikimedia Commons",
  },
];

/** True for a preview spot's id -- the only way a card can tell it is read-only. */
export function isPreviewSpot(spotId: string): boolean {
  return spotId.length > PREVIEW_ID_PREFIX.length && spotId.startsWith(PREVIEW_ID_PREFIX);
}

/**
 * Deck-ready copies of the previews, with `distanceM` measured from
 * `origin` (the deck's resolved location) when one is given -- the same
 * haversine the Cerca RPC would have computed server-side.
 */
export function previewCards(origin?: LatLng): SpotCard[] {
  return PREVIEW_SPOTS.map((spot) => {
    const card: SpotCard = { ...spot, author: { ...spot.author } };
    if (origin) card.distanceM = haversineMeters(origin, spot);
    return card;
  });
}

/**
 * Tight [[south, west], [north, east]] box around every preview spot, for
 * SpotMap's `fitBounds`: the city outline is tall and the previews are all
 * downtown, so fitting the city would leave every one of them off-screen.
 */
export function previewBounds(): [[number, number], [number, number]] {
  let south = Infinity;
  let west = Infinity;
  let north = -Infinity;
  let east = -Infinity;
  for (const spot of PREVIEW_SPOTS) {
    if (spot.lat < south) south = spot.lat;
    if (spot.lat > north) north = spot.lat;
    if (spot.lng < west) west = spot.lng;
    if (spot.lng > east) east = spot.lng;
  }
  return [
    [south, west],
    [north, east],
  ];
}

/** Mi mapa-ready copies, tagged `source: "preview"` so the map can style and exempt them. */
export function previewMapSpots(): MapSpot[] {
  return previewCards().map((card) => ({ ...card, source: "preview" as const }));
}
