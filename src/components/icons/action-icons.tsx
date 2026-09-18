import type { SVGProps } from "react";

export interface ActionIconProps extends SVGProps<SVGSVGElement> {
  /** Rendered width and height in pixels. Defaults to 20. */
  size?: number;
}

/**
 * Flat-top hexagon -- six straight edges, same "faceted gem" language as
 * the map pins in pin-icons.tsx, but a closed, symmetric outline instead of
 * one tapering to a point. This is a UI control, not a location marker, so
 * it does not need the pin's anchor tip.
 */
const HEX_OUTLINE = "M16,3 L27,9.5 L27,22.5 L16,29 L5,22.5 L5,9.5 Z";

/** Plus glyph, same straight-stroke, rounded-cap language as CheckIcon/FlagIcon. */
const PLUS_GLYPH = "M16 11 V21 M11 16 H21";

/**
 * "Place a new spot" glyph for the map's floating action button: the
 * faceted-gem outline (the mark this whole app uses for a spot) plus a
 * plain "+", instead of a generic Material/Feather-style pin+plus icon
 * pulled from a pack.
 */
export function AddSpotIcon({ size = 20, className, ...props }: ActionIconProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      {...props}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path d={HEX_OUTLINE} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinejoin="round" />
      <path d={PLUS_GLYPH} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
    </svg>
  );
}
