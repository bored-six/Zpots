import { haversineMeters, type LatLng } from "@/lib/geo";
import type { MapSpot, SpotAuthor, SpotCard } from "@/lib/spots";

/**
 * Preview spots: a curated set of famous Zamboanga City places. Originally
 * a five-item empty-state fallback (Paseo deck and Mi mapa when there is
 * nothing real to show yet), the set grew to 20 to also back the Famosos
 * lane -- a browsable tab of well-known places, not just a placeholder.
 * Both uses read the same array; `isPreviewSpot` and `source: "preview"`
 * are what every consumer uses to tell a preview apart from a real spot.
 *
 * They are client-side constants, never database rows: the `spots`
 * table's photo_url CHECK only accepts the spot-photos bucket, and a
 * preview must never be saveable, confirmable, or reportable (its id does
 * not exist server-side).
 *
 * Photos are hot-linked from Wikimedia Commons (CC BY-SA, CC BY, or CC0 --
 * see each entry's `photoCredit`) and carry their attribution, which the
 * card and popup render. Not every entry has a freely-licensed photo;
 * `photoUrl` is optional, but any entry that has one must carry a credit.
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
  {
    id: "preview-merloquet-falls",
    name: "Merloquet Falls",
    note: "A three-tier waterfall past Sibulao, a trek in on foot. Cold, clear pools good for swimming.",
    lat: 7.31066,
    lng: 122.21366,
    status: "confirmed",
    confirmations: 2,
    createdAt: PREVIEW_CREATED_AT,
    author: PREVIEW_AUTHOR,
    photoUrl: `${COMMONS}/c/cc/Merloquet_Falls.jpg/1280px-Merloquet_Falls.jpg`,
    photoCredit: "Heigen Villacarlos, CC BY-SA 4.0, Wikimedia Commons",
  },
  {
    id: "preview-metropolitan-cathedral",
    name: "Metropolitan Cathedral",
    note: "The city's Catholic cathedral downtown, rebuilt after the 2013 siege. Mass times posted at the door.",
    lat: 6.90893,
    lng: 122.07602,
    status: "confirmed",
    confirmations: 2,
    createdAt: PREVIEW_CREATED_AT,
    author: PREVIEW_AUTHOR,
    photoUrl:
      `${COMMONS}/2/2b/Zamboanga_Cathedral%2C_Mar_2026_%281%29.jpg/` +
      "1280px-Zamboanga_Cathedral%2C_Mar_2026_%281%29.jpg",
    photoCredit: "Ralff Nestor Nacor, CC BY-SA 4.0, Wikimedia Commons",
  },
  {
    id: "preview-taluksangay-mosque",
    name: "Taluksangay Mosque",
    note: "A long-standing mosque built over the water in Taluksangay, on stilts like the barangay around it.",
    lat: 6.95072,
    lng: 122.18153,
    status: "confirmed",
    confirmations: 2,
    createdAt: PREVIEW_CREATED_AT,
    author: PREVIEW_AUTHOR,
    photoUrl:
      `${COMMONS}/0/0f/Taluksangay_Mosque_front_%28Zamboanga_City%3B_10-12-2023%29.jpg/` +
      "1280px-Taluksangay_Mosque_front_%28Zamboanga_City%3B_10-12-2023%29.jpg",
    photoCredit: "Patrickroque01, CC BY-SA 4.0, Wikimedia Commons",
  },
  {
    id: "preview-zamboanga-city-hall",
    name: "Zamboanga City Hall",
    note: "The city government's seat facing Plaza Pershing, colonial-era facade, about 190 m from the plaza.",
    lat: 6.90391,
    lng: 122.07628,
    status: "confirmed",
    confirmations: 2,
    createdAt: PREVIEW_CREATED_AT,
    author: PREVIEW_AUTHOR,
    photoUrl:
      `${COMMONS}/4/48/Zamboanga_City_Hall_facade_%28NS_Valderosa%2C_Zamboanga_City%3B_10-12-2023%29.jpg/` +
      "1280px-Zamboanga_City_Hall_facade_%28NS_Valderosa%2C_Zamboanga_City%3B_10-12-2023%29.jpg",
    photoCredit: "Patrickroque01, CC BY-SA 4.0, Wikimedia Commons",
  },
  {
    id: "preview-climaco-freedom-park",
    name: "Climaco Freedom Park",
    note: "Hilltop park and cross named for slain mayor Cesar Climaco, with a view over the city.",
    lat: 6.96486,
    lng: 122.07632,
    status: "confirmed",
    confirmations: 2,
    createdAt: PREVIEW_CREATED_AT,
    author: PREVIEW_AUTHOR,
    photoUrl: `${COMMONS}/d/d2/Cross_Mayor_-_Abong_Abong.JPG/1280px-Cross_Mayor_-_Abong_Abong.JPG`,
    photoCredit: "Wowzamboangacity, CC BY 3.0, Wikimedia Commons",
  },
  {
    id: "preview-bolong-beach",
    name: "Bolong Beach",
    note: "A quieter beach east of downtown, past Manicahan. Locals grill by the shore on weekends.",
    lat: 7.09787,
    lng: 122.24096,
    status: "confirmed",
    confirmations: 2,
    createdAt: PREVIEW_CREATED_AT,
    author: PREVIEW_AUTHOR,
    photoUrl: `${COMMONS}/0/01/Bolong_beach.jpg/1280px-Bolong_beach.jpg`,
    photoCredit: "CyraFelix, CC0, Wikimedia Commons",
  },
  {
    id: "preview-lantawan-grassland",
    name: "Lantawan Grassland",
    note: "Open grassland with a night view of the city lights below. Bring a jacket, it gets breezy.",
    lat: 6.96474,
    lng: 122.06255,
    status: "confirmed",
    confirmations: 2,
    createdAt: PREVIEW_CREATED_AT,
    author: PREVIEW_AUTHOR,
    photoUrl: `${COMMONS}/8/83/Grassland_Night_View.jpg/1280px-Grassland_Night_View.jpg`,
    photoCredit: "Nikkaella, CC0, Wikimedia Commons",
  },
  {
    id: "preview-la-vista-del-mar",
    name: "La Vista del Mar",
    note: "A hillside viewpoint over the strait in Calarian, popular for sunset and pasalubong stops.",
    lat: 6.92454,
    lng: 122.02019,
    status: "confirmed",
    confirmations: 2,
    createdAt: PREVIEW_CREATED_AT,
    author: PREVIEW_AUTHOR,
    photoUrl: `${COMMONS}/c/c9/La_Vista_del_Mar_Beach_Resort.jpg/1280px-La_Vista_del_Mar_Beach_Resort.jpg`,
    photoCredit: "MaryelleJ, CC BY-SA 4.0, Wikimedia Commons",
  },
  {
    id: "preview-grand-masjid-barbara",
    name: "Grand Masjid Barbara",
    note: "A large mosque in Barangay Barbara, one of the city's most visible landmarks off the highway.",
    lat: 6.90347,
    lng: 122.08104,
    status: "confirmed",
    confirmations: 2,
    createdAt: PREVIEW_CREATED_AT,
    author: PREVIEW_AUTHOR,
    photoUrl:
      `${COMMONS}/9/99/Grand_Masjid_Barbara%2C_Zamboanga_City%2C_Mar_2026.jpg/` +
      "1280px-Grand_Masjid_Barbara%2C_Zamboanga_City%2C_Mar_2026.jpg",
    photoCredit: "Ralff Nestor Nacor, CC BY-SA 4.0, Wikimedia Commons",
  },
  {
    id: "preview-once-islas",
    name: "Once Islas",
    note: "One of eleven islets off Zamboanga, this one hosting Siromon Beach Resort. Boat access only.",
    lat: 7.14917,
    lng: 122.26361,
    status: "confirmed",
    confirmations: 2,
    createdAt: PREVIEW_CREATED_AT,
    author: PREVIEW_AUTHOR,
    photoUrl:
      `${COMMONS}/3/31/Once_Islas%2CSiromon_Beach_resort_ZC.jpg/` +
      "1280px-Once_Islas%2CSiromon_Beach_resort_ZC.jpg",
    photoCredit: "BelleIbanez, CC BY 4.0, Wikimedia Commons",
  },
  {
    id: "preview-manicahan-beach",
    name: "Manicahan Beach",
    note: "An easy-to-miss beach in Manicahan, past the barangay center. Locals call it underrated.",
    lat: 7.00941,
    lng: 122.19683,
    status: "confirmed",
    confirmations: 2,
    createdAt: PREVIEW_CREATED_AT,
    author: PREVIEW_AUTHOR,
    photoUrl: `${COMMONS}/e/eb/Manicahan_beach.jpg/1280px-Manicahan_beach.jpg`,
    photoCredit: "CyraFelix, CC0, Wikimedia Commons",
  },
  {
    id: "preview-duyan-spot",
    name: "Duyan Spot",
    note: "Hammock hangout in Upper Cabatangan with a view deck, billiards and karaoke. Open till midnight.",
    lat: 6.945938,
    lng: 122.060937,
    status: "confirmed",
    confirmations: 2,
    createdAt: PREVIEW_CREATED_AT,
    author: PREVIEW_AUTHOR,
  },
  {
    id: "preview-muruk-haven",
    name: "Muruk Haven",
    note: "A hiking trail area in Upper Pasonanca, about 30 minutes in on foot. Popular for trail running and biking.",
    lat: 6.973313,
    lng: 122.079937,
    status: "confirmed",
    confirmations: 2,
    createdAt: PREVIEW_CREATED_AT,
    author: PREVIEW_AUTHOR,
  },
  {
    id: "preview-yakan-weaving-village",
    name: "Yakan Weaving Village",
    note: "A Yakan weaving shop and workshop in Calarian. Watch the looms work, buy fabric from the source.",
    lat: 6.92491,
    lng: 122.0222,
    status: "confirmed",
    confirmations: 2,
    createdAt: PREVIEW_CREATED_AT,
    author: PREVIEW_AUTHOR,
  },
  {
    id: "preview-canelar-barter-trade-center",
    name: "Canelar Barter Trade Center",
    note: "The barter trade marketplace in Canelar, stalls of goods brought in from across the Sulu Sea.",
    lat: 6.91393,
    lng: 122.07423,
    status: "confirmed",
    confirmations: 2,
    createdAt: PREVIEW_CREATED_AT,
    author: PREVIEW_AUTHOR,
    photoUrl: "https://upload.wikimedia.org/wikipedia/commons/b/be/Barter_goods_1022.jpg",
    photoCredit: "LuzViMindaLife, CC BY-SA 4.0, Wikimedia Commons",
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
 * SpotMap's `fitBounds`. The set used to be all downtown, so this stayed
 * tight; it now spans the whole city (Merloquet Falls in the north to
 * Great Santa Cruz Island in the south), so the box is correspondingly
 * wide. That's kept deliberately -- Mi mapa's preview pins should show
 * where the famous places actually are, not a downtown-only slice that
 * hides two-thirds of the set. `fitBounds`'s own `maxZoom` cap (SpotMap's
 * `FIT_BOUNDS_OPTIONS`) already keeps a tight cluster from landing at
 * street level, so the wide fit costs nothing and the user can zoom in
 * on downtown from there.
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
