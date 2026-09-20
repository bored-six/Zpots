"use client";

import { useId, type SVGProps } from "react";

export interface OrnamentProps extends Omit<SVGProps<SVGSVGElement>, "width" | "height"> {
  /** Rendered width, CSS-unit string or number. Defaults to "100%". */
  width?: string | number;
  /** Rendered height in pixels. Defaults per-component. */
  height?: number;
}

/**
 * Talavera/azulejo tile band -- a continuous stone hairline diamond
 * lattice on a cream-deep ground, alternating a teal and a terracotta
 * center square at each diamond's center (see globals.css tokens for the
 * colors, referenced here via `var(--color-*)` so the SVG never hardcodes
 * a hex outside the halo-cream exception). A single 12px-unit `<pattern>`
 * (two diamonds wide, so the teal/terracotta alternation itself repeats)
 * tiles the full `width="100%"` rather than a fixed row of diamonds, so it
 * stays crisp and continuous at any width (header, card divider, settings
 * page) instead of stretching or clipping mid-tile.
 *
 * The pattern id is generated per-instance with `useId()` -- several bands
 * render on the same page at once (the settings page alone renders five),
 * and a shared literal id would mean every band after the first silently
 * reused the first one's `<defs>` instead of drawing its own.
 */
export function AzulejoBand({ width = "100%", height = 18, className, ...props }: OrnamentProps) {
  const patternId = `zpots-azulejo-tile-${useId()}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 24 12"
      preserveAspectRatio="none"
      {...props}
      className={className}
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <pattern id={patternId} width={24} height={12} patternUnits="userSpaceOnUse">
          <rect width={24} height={12} fill="var(--color-cream-deep)" />
          <path
            d="M6,1 L11,6 L6,11 L1,6 Z"
            fill="none"
            stroke="var(--color-stone)"
            strokeWidth={1}
          />
          <path
            d="M18,1 L23,6 L18,11 L13,6 Z"
            fill="none"
            stroke="var(--color-stone)"
            strokeWidth={1}
          />
          <rect x={5} y={5} width={2} height={2} fill="var(--color-teal)" />
          <rect x={17} y={5} width={2} height={2} fill="var(--color-terracotta)" />
        </pattern>
      </defs>
      <rect width={24} height={12} fill={`url(#${patternId})`} />
    </svg>
  );
}

/**
 * Sail-stripe rule as a component, wrapping the `.vinta-rule` CSS class
 * (globals.css) so callers don't have to remember the raw class name.
 * `orientation="vertical"` is used for the banner pill's left edge; the
 * default horizontal form is the header/modal divider.
 */
export interface VintaRuleProps {
  orientation?: "horizontal" | "vertical";
  className?: string;
}

export function VintaRule({ orientation = "horizontal", className = "" }: VintaRuleProps) {
  const orientationClass = orientation === "vertical" ? "vinta-rule--vertical" : "";
  return (
    <div
      className={[orientationClass, "vinta-rule", className].filter(Boolean).join(" ")}
      role="presentation"
    />
  );
}

/**
 * Shallow stone arch -- a single low, wide curve standing in for the top
 * of a colonial stone archway. Used as the header's bottom edge, above the
 * VintaRule. `preserveAspectRatio="none"` so it stretches full-width
 * without distorting the curve's readability at any header width.
 */
export function StoneArch({ width = "100%", height = 10, className, ...props }: OrnamentProps) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 100 10"
      preserveAspectRatio="none"
      {...props}
      className={className}
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      {/* fill mirrors --color-stone */}
      <path d="M0,0 Q50,10 100,0 L100,10 L0,10 Z" fill="#cdb693" />
    </svg>
  );
}

