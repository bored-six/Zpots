import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import L from "leaflet";

import { PinChassis, PuntoPin } from "@/components/icons/pin-icons";
import { PIN_TIER_SIZES, type PinTier } from "@/lib/pin-density";
import { isSpotCategory, type SpotCategory } from "@/lib/spots";

export type PinStatus = "unconfirmed" | "confirmed";

/**
 * Every size a pin can render at -- pin-revamp-spec.md section 14.4. No
 * pin ever shows a photo; photos stay on the deck card and in the popup.
 */
export type PinSize = 32 | 22 | 16 | 10;

const PLAIN_SIZES: readonly PinSize[] = [32, 22, 16, 10];

const DEFAULT_PLAIN_SIZE: PinSize = 22;

const PUNTO_SIZE = 10;

/** `PIN_TIER_SIZES` is the shared ladder ([32, 22, 16, 10]) -- reuse its index as the tier. */
function tierForSize(size: number): PinTier {
  return PIN_TIER_SIZES.indexOf(size as (typeof PIN_TIER_SIZES)[number]) as PinTier;
}

/**
 * `iconAnchor = [size / 2, round(size * 30 / 32)]`, `popupAnchor = [0, -floor(size * 28 / 32)]`
 * (pin-revamp-spec.md section 14.4). Derived from the shared rose's tail tip
 * at (16, 30) in the 0..32 viewBox, scaled to `size` and rounded/floored to
 * reproduce the pin redesign's original 22px anchor values exactly. The
 * punto (size 10) does not use this formula -- see PUNTO_ANCHORS below.
 */
function anchorsForSize(size: number): { iconAnchor: [number, number]; popupAnchor: [number, number] } {
  return {
    iconAnchor: [size / 2, Math.round((size * 30) / 32)],
    popupAnchor: [0, -Math.floor((size * 28) / 32)],
  };
}

/**
 * The punto (pin-revamp-spec.md section 14.5) drops the rose entirely and is
 * anchored at its own centre, not the tail tip -- a fixed override, not the
 * general anchor formula above.
 */
const PUNTO_ANCHORS = { iconAnchor: [5, 5] as [number, number], popupAnchor: [0, -6] as [number, number] };

export interface CreatePinIconOptions {
  /**
   * Flags this render as the one right after a pin flipped Unconfirmed ->
   * Confirmed (the "sello" moment, spec section 4.7). No-op unless
   * `status: "confirmed"` and `size` renders a rose (not a punto).
   * `PinChassis` renders the class on the seal `<g>` itself -- no more
   * string-splicing the serialized markup.
   */
  justConfirmed?: boolean;
  /** Read cue on the pin (spec section 2). Ignored only at size 10 (E1/E4). */
  category?: SpotCategory;
  /** Default 22. Any value not in `PinSize` throws `RangeError`. */
  size?: PinSize;
}

function validCategory(category: SpotCategory | undefined): SpotCategory | undefined {
  return category !== undefined && isSpotCategory(category) ? category : undefined;
}

/**
 * Renders the matching hand-drawn pin (see pin-icons.tsx) to static markup
 * and wraps it in a Leaflet DivIcon so it can be used as a marker icon. A
 * plain divIcon is used instead of L.icon() because these are inline SVG
 * components, not image files, and `zpots-pin-icon` opts the wrapper out of
 * Leaflet's default marker background/border/shadow styling.
 */
export function createPinIcon(status: PinStatus, options?: CreatePinIconOptions): L.DivIcon {
  const size = options?.size ?? DEFAULT_PLAIN_SIZE;
  if (!PLAIN_SIZES.includes(size)) {
    throw new RangeError(`createPinIcon: size ${size} is not one of ${PLAIN_SIZES.join(", ")}`);
  }

  const tier = tierForSize(size);
  const category = validCategory(options?.category);

  if (size === PUNTO_SIZE) {
    const html = renderToStaticMarkup(createElement(PuntoPin, { size, status }));
    return L.divIcon({
      html,
      className: `zpots-pin-icon zpots-pin-icon--${status} zpots-pin-icon--tier-${tier} zpots-pin-icon--punto`,
      iconSize: [size, size],
      ...PUNTO_ANCHORS,
    });
  }

  const html = renderToStaticMarkup(
    createElement(PinChassis, {
      size,
      status,
      mode: category ? "open" : "closed",
      category,
      justConfirmed: options?.justConfirmed,
    }),
  );

  return L.divIcon({
    html,
    className: `zpots-pin-icon zpots-pin-icon--${status} zpots-pin-icon--tier-${tier}`,
    iconSize: [size, size],
    ...anchorsForSize(size),
  });
}
