import type { SVGProps } from "react";

export interface PinIconProps extends SVGProps<SVGSVGElement> {
  /** Rendered width and height in pixels. Defaults to 32. */
  size?: number;
}

/**
 * Shared silhouette for both pin states: a faceted gem tapering to a point,
 * its tip anchored to the map coordinate.
 *
 * The first pass at this was a swallowtail pennant flag. It did not survive
 * a real render: the notch collapsed into a smudge at 32px and the outline
 * read as a lumpy blob rather than a deliberate shape. This shape is six
 * straight edges, symmetric about the tip's vertical axis, with no fine
 * detail to lose at small size -- and "hidden gems" is literally the app's
 * own description of what a spot is, so the mark carries meaning instead of
 * being decoration bolted onto a pin. Still not the stock
 * teardrop-with-a-circle-hole: no dome, no circle.
 */
const PIN_OUTLINE = "M15,30 L23,20 L25,13 L15,4 L5,13 L7,20 Z";

/** Small inner facet, same orientation as the outline, nested well clear of its edges. */
const PIN_FACET = "M15,9 L20,15 L15,19 L10,15 Z";

const VIEW_BOX = "0 0 32 32";

/**
 * Provisional pin: hollow. Fill is `none`, not a tinted fill and not a
 * dashed stroke -- a dash pattern fragments a 32px outline into
 * disconnected chunks the eye can't lock onto. A continuous stroke around
 * an empty interior reads as "outline only" at any size, in any color,
 * even in pure greyscale.
 */
export function UnconfirmedPin({ size = 32, className, ...props }: PinIconProps) {
  return (
    <svg
      viewBox={VIEW_BOX}
      width={size}
      height={size}
      {...props}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {/* Fixed-color halo (not currentColor) so the silhouette separates
          from busy map tiles regardless of pin state or terrain color. */}
      <path
        d={PIN_OUTLINE}
        fill="none"
        stroke="white"
        strokeOpacity={0.95}
        strokeWidth={4}
        strokeLinejoin="round"
      />
      <path d={PIN_OUTLINE} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
      <path d={PIN_FACET} fill="none" stroke="currentColor" strokeWidth={1.25} strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Confirmed pin: the identical outline, filled solid. The facet is a true
 * cut-out (fillRule="evenodd"), so it reads as a window through solid
 * material rather than a separately drawn shape -- the "filled in" version
 * of the unconfirmed outline, distinguishable from it by fill state alone.
 */
export function ConfirmedPin({ size = 32, className, ...props }: PinIconProps) {
  return (
    <svg
      viewBox={VIEW_BOX}
      width={size}
      height={size}
      {...props}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {/* Fixed-color halo (not currentColor) so the silhouette separates
          from busy map tiles regardless of pin state or terrain color. */}
      <path
        d={PIN_OUTLINE}
        fill="none"
        stroke="white"
        strokeOpacity={0.95}
        strokeWidth={4}
        strokeLinejoin="round"
      />
      <path
        d={`${PIN_OUTLINE} ${PIN_FACET}`}
        fillRule="evenodd"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth={1}
        strokeLinejoin="round"
      />
    </svg>
  );
}
