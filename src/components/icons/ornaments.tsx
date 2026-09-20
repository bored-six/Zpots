import type { SVGProps } from "react";

export interface OrnamentProps extends Omit<SVGProps<SVGSVGElement>, "width" | "height"> {
  /** Rendered width, CSS-unit string or number. Defaults to "100%". */
  width?: string | number;
  /** Rendered height in pixels. Defaults per-component. */
  height?: number;
}

/**
 * Talavera/azulejo tile band -- a tileable strip of stone-outlined diamonds,
 * alternating a teal and a terracotta center dot, on a cream-deep tile
 * ground (see globals.css tokens). Drawn once as a single repeating
 * `<pattern>` tile rather than a fixed row of diamonds, so it stays crisp
 * at any width (header, card divider, settings page) instead of
 * stretching or clipping mid-tile.
 */
export function AzulejoBand({ width = "100%", height = 18, className, ...props }: OrnamentProps) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 36 18"
      preserveAspectRatio="none"
      {...props}
      className={className}
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <pattern id="zpots-azulejo-tile" width={36} height={18} patternUnits="userSpaceOnUse">
          {/* fill mirrors --color-cream-deep */}
          <rect width={36} height={18} fill="#ecdfc3" />
          {/* stroke mirrors --color-stone */}
          <path d="M9,2 L16,9 L9,16 L2,9 Z" fill="none" stroke="#cdb693" strokeWidth={1.25} />
          <path d="M27,2 L34,9 L27,16 L20,9 Z" fill="none" stroke="#cdb693" strokeWidth={1.25} />
          {/* dots mirror --color-teal and --color-terracotta */}
          <circle cx={9} cy={9} r={1.6} fill="#1f6f78" />
          <circle cx={27} cy={9} r={1.6} fill="#b5482c" />
        </pattern>
      </defs>
      <rect width={36} height={18} fill="url(#zpots-azulejo-tile)" />
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

/**
 * Thin wrought-iron scroll divider -- a single terracotta stroke that
 * curls at each end, standing in for the ironwork balcony/gate scrollwork
 * of the Spanish-colonial visual direction. Used between sections instead
 * of a plain <hr>.
 */
export function Flourish({ width = "100%", height = 16, className, ...props }: OrnamentProps) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 200 16"
      preserveAspectRatio="none"
      {...props}
      className={className}
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M4,8 C4,3 10,3 12,6 C14,9 10,11 8,8 M12,8 H150 M188,8 C188,3 194,3 196,6 C198,9 194,11 192,8"
        fill="none"
        stroke="#a8492f"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <circle cx={4} cy={8} r={1.5} fill="#a8492f" />
      <circle cx={196} cy={8} r={1.5} fill="#a8492f" />
    </svg>
  );
}

