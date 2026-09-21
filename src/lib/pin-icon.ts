import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import L from "leaflet";

import { PinChassis, PuntoPin } from "@/components/icons/pin-icons";
import { PIN_TIER_SIZES, type PinTier } from "@/lib/pin-density";
import { isSpotCategory, type SpotCategory } from "@/lib/spots";

export type PinStatus = "unconfirmed" | "confirmed";

/** Every size a plain (non-photo) pin can render at -- pin-revamp-spec.md section 4.6. */
export type PinSize = 32 | 22 | 16 | 10;
/** Every size a photo pin can render at (photo pins never fall below the punto ladder's tier 1). */
export type PhotoPinSize = 44 | 32;

const PLAIN_SIZES: readonly PinSize[] = [32, 22, 16, 10];
const PHOTO_SIZES: readonly PhotoPinSize[] = [44, 32];

const DEFAULT_PLAIN_SIZE: PinSize = 22;
const DEFAULT_PHOTO_SIZE: PhotoPinSize = 44;

const PUNTO_SIZE = 10;
const CLOSED_ONLY_SIZE = 16;

/** `PIN_TIER_SIZES` is the shared ladder ([44, 32, 22, 16, 10]) -- reuse its index as the tier. */
function tierForSize(size: number): PinTier {
  return PIN_TIER_SIZES.indexOf(size as (typeof PIN_TIER_SIZES)[number]) as PinTier;
}

/**
 * `iconAnchor = [size / 2, round(size * 30 / 32)]`, `popupAnchor = [0, -floor(size * 28 / 32)]`
 * (pin-revamp-spec.md section 4.6). Derived from the shared rose's tail tip
 * at (16, 30) in the 0..32 viewBox, scaled to `size` and rounded/floored to
 * reproduce the pin redesign's original 22px and 44px anchor values exactly.
 * The punto (size 10) does not use this formula -- see PUNTO_ANCHORS below.
 */
function anchorsForSize(size: number): { iconAnchor: [number, number]; popupAnchor: [number, number] } {
  return {
    iconAnchor: [size / 2, Math.round((size * 30) / 32)],
    popupAnchor: [0, -Math.floor((size * 28) / 32)],
  };
}

/**
 * The punto (pin-revamp-spec.md section 4.5) drops the rose entirely and is
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
  /** Read cue on the pin (spec section 2). Ignored at size 16 and 10, and when invalid (E1). */
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
  const category = size === CLOSED_ONLY_SIZE ? undefined : validCategory(options?.category);

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

/**
 * Photo hole diameter and offset (spec section 4.6): the transparent window
 * `PinChassis` leaves open in photo mode is a circle of radius 8.5 in the
 * shared 0..32 viewBox -- `round(size * 17 / 32)` scales that to `size`.
 */
function photoHole(size: number): { diameter: number; offset: number } {
  const diameter = Math.round((size * 17) / 32);
  return { diameter, offset: (size - diameter) / 2 };
}

/** Minimal HTML-attribute escape -- this string lands inside a divIcon's `html`, not JSX. */
function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export interface CreatePhotoPinIconOptions {
  /** Flags this render as the one right after a pin flipped Unconfirmed -> Confirmed (spec section 4.7). */
  justConfirmed?: boolean;
  /** Read cue on the pin (spec section 2). Photo pins never draw a glyph (A2) -- accepted for interface parity, unused. */
  category?: SpotCategory;
  /** Default 44. 44 or 32 render the photo; anything else throws `RangeError`. */
  size?: PhotoPinSize;
}

/**
 * Renders a spot's own photo, clipped to a circle, layered underneath the
 * matching-status `PinChassis` in photo mode -- the frame's transparent
 * window is what lets the photo actually show through. Used for "mine"
 * (and famous-place preview) pins on Mi mapa (social-spots.md); `createPinIcon`
 * above is unchanged and still backs the plain compass pins everywhere else.
 */
export function createPhotoPinIcon(
  photoUrl: string,
  status: PinStatus,
  options?: CreatePhotoPinIconOptions,
): L.DivIcon {
  const size = options?.size ?? DEFAULT_PHOTO_SIZE;
  if (!PHOTO_SIZES.includes(size)) {
    throw new RangeError(`createPhotoPinIcon: size ${size} is not one of ${PHOTO_SIZES.join(", ")}`);
  }

  const tier = tierForSize(size);

  const frameMarkup = renderToStaticMarkup(
    createElement(PinChassis, {
      size,
      status,
      mode: "photo",
      justConfirmed: options?.justConfirmed,
    }),
  );

  const { diameter: holeDiameter, offset: holeOffset } = photoHole(size);
  const safePhotoUrl = escapeHtmlAttribute(photoUrl);

  const html = `<span class="zpots-pin-icon-photo-wrap" style="position:relative;display:block;width:${size}px;height:${size}px;">` +
    `<span style="position:absolute;left:${holeOffset}px;top:${holeOffset}px;width:${holeDiameter}px;height:${holeDiameter}px;border-radius:50%;overflow:hidden;background:#f6eedc;">` +
    `<img src="${safePhotoUrl}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;" />` +
    `</span>` +
    `<span style="position:absolute;inset:0;">${frameMarkup}</span>` +
    `</span>`;

  return L.divIcon({
    html,
    className: `zpots-pin-icon zpots-pin-icon--photo zpots-pin-icon--${status} zpots-pin-icon--tier-${tier}`,
    iconSize: [size, size],
    ...anchorsForSize(size),
  });
}
