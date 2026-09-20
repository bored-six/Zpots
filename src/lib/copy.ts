/**
 * Every UI string in one place: a Chavacano primary (`cv`) and an English
 * secondary (`en`). Chavacano is what people read; English is what screen
 * readers announce and what the frozen English-name test queries target
 * (see `Bilingual.tsx` / `bilingualLabel`) -- accessible names stay English
 * per the redesign spec.
 *
 * FLAG FOR REVIEW: the author of this file is not a native Chavacano
 * speaker. These are best-effort Zamboangueno forms and must be checked by
 * a local before launch.
 */
export const COPY = {
  addSpot: { cv: "Marca un lugar", en: "Add a spot" },
  tapToPlace: { cv: "Toca el mapa para pone el pin", en: "Tap the map to place your pin" },
  confirmVisit: { cv: "Ya anda yo aqui", en: "I've been here" },
  report: { cv: "Reporta", en: "Report" },
  statusConfirmed: { cv: "Confirmao", en: "Confirmed" },
  statusUnconfirmed: { cv: "No pa confirmao", en: "Unconfirmed" },
  loading: { cv: "Ta carga", en: "Loading" },
  outsideCity: { cv: "Aqui lang na Zamboanga", en: "Pins can only be placed inside Zamboanga City" },
  signInFirst: { cv: "Entra primero", en: "Sign in to continue" },
  tagline: { cv: "Ciudad Latina de Asia", en: "Asia's Latin City, one spot at a time" },
  cancel: { cv: "Cancela", en: "Cancel" },
  save: { cv: "Guarda", en: "Save" },

  // social-spots.md PRD ("Copy" section) -- feed/save/follow/profile/post
  // copy for the social redesign. "spots" is a deliberate exception: the
  // brand word is the same word in both languages (see copy.adversarial
  // .test.ts allowlist), everything else below is translated per usual.
  spots: { cv: "Spots", en: "Spots" },
  cerca: { cv: "Cerca", en: "Near me" },
  nuevo: { cv: "Nuevo", en: "New" },
  siguiendo: { cv: "Siguiendo", en: "Following" },
  hoy: { cv: "Hoy", en: "Today" },
  miMapa: { cv: "Mi mapa", en: "My map" },
  gente: { cv: "Gente", en: "People" },
  yo: { cv: "Yo", en: "Me" },
  saved: { cv: "Guardao", en: "Saved" },
  unsave: { cv: "Quita", en: "Remove" },
  follow: { cv: "Camina con", en: "Follow" },
  unfollow: { cv: "Deja de camina", en: "Unfollow" },
  followingState: { cv: "Ta camina", en: "Following" },
  followers: { cv: "Seguidores", en: "Followers" },
  followingCount: { cv: "Siguiendo", en: "Following" },
  pickHandle: { cv: "Escoge tu handle", en: "Pick your handle" },
  handleTaken: { cv: "Ya tiene ese handle", en: "That handle is taken" },
  takePhoto: { cv: "Saca foto", en: "Take a photo" },
  choosePhoto: { cv: "Escoge foto", en: "Choose a photo" },
  whereIsIt: { cv: "Donde este?", en: "Where is it?" },
  usingCenter: { cv: "Ta usa el centro del ciudad", en: "Using the city center" },
  noSpotsYet: { cv: "Nuay pa spots", en: "No spots yet" },
  emptyMap: { cv: "Guarda un spot para mira aqui", en: "Save a spot to see it here" },
  findPeople: { cv: "Busca gente", en: "Find people" },
  nobodyToday: { cv: "Nuay pa quien ya sale hoy", en: "Nobody has gone out today" },
  distanceAway: { cv: "{n} de aqui", en: "{n} away" },
  droppedBy: { cv: "De", en: "By" },
  spotIsUp: { cv: "Ya sale tu spot", en: "Your spot is up" },

  // Profile page ("Not found" state) -- added while implementing
  // src/app/u/[handle]/page.tsx, not in the PRD's own Copy table.
  profileNotFound: { cv: "Nuay ese perfil", en: "Profile not found" },

  // Fix round: Mi mapa's legend and the deck's "feed failed" / Gente's
  // empty-section copy.
  mine: { cv: "Mios", en: "Mine" },
  been: { cv: "Ya anda", en: "Been" },
  couldNotLoad: { cv: "No puede carga", en: "Could not load" },
  noPeopleYet: { cv: "Nuay pa gente", en: "No people yet" },
} as const;

export type CopyKey = keyof typeof COPY;

/** English secondary string for a key, for use as a button/element aria-label. */
export function bilingualLabel(key: CopyKey): string {
  return COPY[key].en;
}
