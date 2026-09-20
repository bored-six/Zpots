import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import L from "leaflet";

import { ConfirmedPin, PhotoPinFrame, UnconfirmedPin } from "@/components/icons/pin-icons";

export type PinStatus = "unconfirmed" | "confirmed";

const ICON_SIZE = 22;

// The shared silhouette in pin-icons.tsx lives in a 0..32 / 0..32 viewBox
// with its tail tapering to a point at (16, 30) -- 2px in from the bottom
// edge, directly below the compass rose's center (16, 16). That point is
// the spot the marker actually names, so it (not the box center) has to
// be the Leaflet anchor. Scaled by 22/32 and rounded: (16, 30) -> (11, 21).
const ICON_ANCHOR: [number, number] = [11, 21];
const POPUP_ANCHOR: [number, number] = [0, -19];

// These two hex values are the only ones allowed in this file, and they
// must equal --color-stone-deep and --color-teal from globals.css.
const PIN_COLOR: Record<PinStatus, string> = {
  // Stone-deep -- muted, reads as "not vouched for yet".
  unconfirmed: "#7a6448",
  // Teal -- reads as "vouched for".
  confirmed: "#1f6f78",
};

/**
 * Renders the matching hand-drawn pin (see pin-icons.tsx) to static markup
 * and wraps it in a Leaflet DivIcon so it can be used as a marker icon.
 * A plain divIcon is used instead of L.icon() because these are inline
 * SVG components, not image files, and `zpots-pin-icon` opts the wrapper
 * out of Leaflet's default marker background/border/shadow styling.
 */
export function createPinIcon(status: PinStatus): L.DivIcon {
  const PinComponent = status === "confirmed" ? ConfirmedPin : UnconfirmedPin;

  const markup = renderToStaticMarkup(
    createElement(PinComponent, {
      size: ICON_SIZE,
      style: { color: PIN_COLOR[status] },
    })
  );

  return L.divIcon({
    html: markup,
    className: `zpots-pin-icon zpots-pin-icon--${status}`,
    iconSize: [ICON_SIZE, ICON_SIZE],
    iconAnchor: ICON_ANCHOR,
    popupAnchor: POPUP_ANCHOR,
  });
}

// Photo pins (Mi mapa "mine" spots, social-spots.md UI spec: "every pin is
// the spot's photo inside the compass-rose frame") are drawn at 44px, twice
// the plain pin's 22px, so the anchor math below is the same
// tail-tip-at-(16,30)-in-a-0..32-viewBox derivation as ICON_ANCHOR/
// POPUP_ANCHOR above, just carried through at the larger scale instead of
// re-measured from scratch.
const PHOTO_ICON_SIZE = 44;
const PHOTO_ICON_ANCHOR: [number, number] = [22, 41];
const PHOTO_POPUP_ANCHOR: [number, number] = [0, -38];

// PhotoPinFrame's transparent window is a circle of radius 8.5 in the
// shared 0..32 viewBox -- scaled to the 44px icon, that's this diameter.
const PHOTO_HOLE_DIAMETER = Math.round(PHOTO_ICON_SIZE * ((8.5 * 2) / 32));

/** Minimal HTML-attribute escape -- this string lands inside a divIcon's `html`, not JSX. */
function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Renders a spot's own photo, clipped to a circle, layered underneath the
 * matching-status `PhotoPinFrame` -- the frame's fill="none" window is what
 * lets the photo actually show through (see PhotoPinFrame's doc comment).
 * Used for "mine" pins on Mi mapa (social-spots.md); `createPinIcon` above
 * is unchanged and still backs the plain compass pins everywhere else.
 */
export function createPhotoPinIcon(photoUrl: string, status: PinStatus): L.DivIcon {
  const frameMarkup = renderToStaticMarkup(
    createElement(PhotoPinFrame, {
      size: PHOTO_ICON_SIZE,
      style: { color: PIN_COLOR[status] },
    })
  );

  const holeOffset = (PHOTO_ICON_SIZE - PHOTO_HOLE_DIAMETER) / 2;
  const safePhotoUrl = escapeHtmlAttribute(photoUrl);

  const html = `<span class="zpots-pin-icon-photo-wrap" style="position:relative;display:block;width:${PHOTO_ICON_SIZE}px;height:${PHOTO_ICON_SIZE}px;">` +
    `<span style="position:absolute;left:${holeOffset}px;top:${holeOffset}px;width:${PHOTO_HOLE_DIAMETER}px;height:${PHOTO_HOLE_DIAMETER}px;border-radius:50%;overflow:hidden;background:#f6eedc;">` +
    `<img src="${safePhotoUrl}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;" />` +
    `</span>` +
    `<span style="position:absolute;inset:0;">${frameMarkup}</span>` +
    `</span>`;

  return L.divIcon({
    html,
    className: "zpots-pin-icon zpots-pin-icon--photo",
    iconSize: [PHOTO_ICON_SIZE, PHOTO_ICON_SIZE],
    iconAnchor: PHOTO_ICON_ANCHOR,
    popupAnchor: PHOTO_POPUP_ANCHOR,
  });
}
