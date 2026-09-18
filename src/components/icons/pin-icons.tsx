import type { SVGProps } from "react";

export interface PinIconProps extends SVGProps<SVGSVGElement> {
  /** Rendered width and height in pixels. Defaults to 32. */
  size?: number;
}

/**
 * Shared silhouette for both pin states: a swallowtail pennant flag
 * planted on a tapering pole, its tip anchored to the map coordinate.
 *
 * Chosen over the stock teardrop-with-a-circle-hole because "flagging a
 * spot you know" is the actual mental model behind this app, and a small
 * pennant reads as coastal/local (bunting, boat flags) without leaning on
 * a literal boat, food, or map-icon-pack cliche. It stays legible at 32px
 * because it is built from a handful of straight edges, not fine detail.
 */
const PIN_OUTLINE =
  "M15,30 L13,20 L13,6 L13,4 L27,6 L30,10 L24,12 L30,15 L27,17 L17,17 L17,21 Z";

/** Small diamond window cut into the flag body -- a window, not a circle. */
const PIN_MARK = "M22,7 L25,10 L22,13 L19,10 Z";

const VIEW_BOX = "0 0 32 32";

/**
 * Provisional pin: dashed, mostly-hollow outline. The diamond mark is an
 * open stroke, not a cut-out, because there is no solid fill to cut from.
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
        d={PIN_OUTLINE}
        fill="currentColor"
        fillOpacity={0.14}
        stroke="currentColor"
        strokeWidth={1.75}
        strokeDasharray="2.75 2.5"
        strokeLinejoin="round"
      />
      <path
        d={PIN_MARK}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.25}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Confirmed pin: same silhouette, filled solid. The diamond mark is now a
 * true cut-out (fillRule="evenodd"), so it reads as a small window through
 * the flag rather than a separately drawn shape -- the "filled in" version
 * of the unconfirmed outline, not a different mark.
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
        d={`${PIN_OUTLINE} ${PIN_MARK}`}
        fillRule="evenodd"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth={1}
        strokeLinejoin="round"
      />
    </svg>
  );
}
