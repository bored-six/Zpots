import type { SVGProps } from "react";

export interface PinIconProps extends SVGProps<SVGSVGElement> {
  /** Rendered width and height in pixels. Defaults to 32. */
  size?: number;
}

/**
 * Shared silhouette for both pin states: a compass rose (four kite-shaped
 * points at N/E/S/W, a small center dot) sitting atop a short tapering
 * tail that anchors to the map coordinate -- the Compass Rose motif from
 * the approved Spanish-colonial Zamboanga mockups, redrawn proportionally
 * into this module's existing 0..32 / 0..32 viewBox (the mockups used a
 * 44-unit box; the silhouette here is the same shape scaled down).
 *
 * Replaces the earlier faceted-gem pin (see structure.md / learnings.md
 * for that shape's history) -- "hidden gems" was the old rationale, but
 * the signed-off visual direction is a navigator's compass rose instead,
 * so the mark now carries *that* meaning: "a point worth charting."
 */
const NORTH_POINT = "M16,2 L19.5,13 L16,16 L12.5,13 Z";
const EAST_POINT = "M30,16 L19,19.5 L16,16 L19,12.5 Z";
const SOUTH_POINT = "M16,30 L12.5,19 L16,16 L19.5,19 Z";
const WEST_POINT = "M2,16 L13,12.5 L16,16 L13,19.5 Z";
const COMPASS_POINTS = `${NORTH_POINT} ${EAST_POINT} ${SOUTH_POINT} ${WEST_POINT}`;

/** Short tapering tail below the rose -- the map anchor point sits at its tip. */
const PIN_TAIL = "M13.5,22 L16,30 L18.5,22 Z";

const VIEW_BOX = "0 0 32 32";

/**
 * Provisional pin: hollow. Fill is `none` on both the rose and the tail,
 * with a fixed-color halo stroke (not currentColor) so the silhouette
 * separates from busy map tiles regardless of pin state or terrain color.
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
      <path
        d={`${COMPASS_POINTS} ${PIN_TAIL}`}
        fill="none"
        stroke="white"
        strokeOpacity={0.95}
        strokeWidth={4}
        strokeLinejoin="round"
      />
      <path
        d={COMPASS_POINTS}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinejoin="round"
      />
      <path d={PIN_TAIL} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinejoin="round" />
      <circle cx={16} cy={16} r={1.6} fill="none" stroke="currentColor" strokeWidth={1.25} />
    </svg>
  );
}

/**
 * Confirmed pin: the identical compass rose and tail, filled solid with a
 * cardinal-colored center dot (the brass fill + cardinal accent from the
 * approved mockup) -- distinguishable from the unconfirmed outline by fill
 * state alone, same silhouette either way.
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
      <path
        d={`${COMPASS_POINTS} ${PIN_TAIL}`}
        fill="none"
        stroke="white"
        strokeOpacity={0.95}
        strokeWidth={4}
        strokeLinejoin="round"
      />
      <path
        d={COMPASS_POINTS}
        fill="currentColor"
        stroke="currentColor"
        strokeWidth={1}
        strokeLinejoin="round"
      />
      <path d={PIN_TAIL} fill="currentColor" stroke="currentColor" strokeWidth={1} strokeLinejoin="round" />
      <circle cx={16} cy={16} r={1.8} fill="#8a2a1e" stroke="none" />
    </svg>
  );
}
