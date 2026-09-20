import L from "leaflet";

import type { PlaceLabel } from "@/lib/places";

/**
 * Landmark labels sit 15px *below* their point (D3 in the PRD -- a pin's
 * silhouette occupies the space above its anchor, so pin and landmark
 * label never fight for the same pixels). Leaflet places the icon box so
 * `iconAnchor` lands on the point, so a negative Y pushes the box down.
 * Barangay and water labels are centred on their point.
 */
const LANDMARK_OFFSET_Y = -15;
const CENTERED_OFFSET_Y = 0;

/** Minimal HTML escape -- this string lands inside a divIcon's `html`, not JSX. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Renders a curated place name (see src/data/zamboanga-places.ts) as a
 * non-interactive Leaflet DivIcon. Colour, font, case and tracking all
 * come from the `.zpots-place-label--<kind>` CSS class in globals.css --
 * this module never writes a hex literal or inline style. Mirrors the
 * shape of src/lib/pin-icon.ts.
 */
export function createPlaceLabelIcon(place: PlaceLabel): L.DivIcon {
  const offsetY = place.kind === "landmark" ? LANDMARK_OFFSET_Y : CENTERED_OFFSET_Y;
  const safeName = escapeHtml(place.name);

  const html = `<span aria-hidden="true">${safeName}</span>`;

  return L.divIcon({
    html,
    className: `zpots-place-label zpots-place-label--${place.kind}`,
    iconSize: [0, 0],
    iconAnchor: [0, offsetY],
  });
}
