import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import L from "leaflet";

import { ConfirmedPin, UnconfirmedPin } from "@/components/icons/pin-icons";

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
