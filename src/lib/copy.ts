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
} as const;

export type CopyKey = keyof typeof COPY;

/** English secondary string for a key, for use as a button/element aria-label. */
export function bilingualLabel(key: CopyKey): string {
  return COPY[key].en;
}
