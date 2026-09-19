import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import L from "leaflet";

import { ConfirmedPin, UnconfirmedPin } from "@/components/icons/pin-icons";

export type PinStatus = "unconfirmed" | "confirmed";

const ICON_SIZE = 32;

// The shared silhouette in pin-icons.tsx lives in a 0..32 / 0..32 viewBox
// with its tail tapering to a point at (16, 30) -- 2px in from the bottom
// edge, directly below the compass rose's center (16, 16). That point is
// the spot the marker actually names, so it (not the box center) has to
// be the Leaflet anchor.
const ICON_ANCHOR: [number, number] = [16, 30];
const POPUP_ANCHOR: [number, number] = [0, -28];

const PIN_COLOR: Record<PinStatus, string> = {
  // Pewter -- muted, reads as "not vouched for yet".
  unconfirmed: "#8b8f99",
  // Brass/gold -- reads as "vouched for".
  confirmed: "#c9962c",
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
    className: "zpots-pin-icon",
    iconSize: [ICON_SIZE, ICON_SIZE],
    iconAnchor: ICON_ANCHOR,
    popupAnchor: POPUP_ANCHOR,
  });
}
