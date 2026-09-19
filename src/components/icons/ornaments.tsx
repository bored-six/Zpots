import type { SVGProps } from "react";

export interface OrnamentProps extends Omit<SVGProps<SVGSVGElement>, "width" | "height"> {
  /** Rendered width, CSS-unit string or number. Defaults to "100%". */
  width?: string | number;
  /** Rendered height in pixels. Defaults per-component. */
  height?: number;
}

/**
 * Talavera/azulejo tile band -- a tileable strip of blue diamond outlines
 * with a terracotta dot center, on a cream tile ground. Drawn once as a
 * single repeating `<pattern>` tile rather than a fixed row of diamonds,
 * so it stays crisp at any width (header, card divider, settings page)
 * instead of stretching or clipping mid-tile.
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
        <pattern id="zpots-azulejo-tile" width={18} height={18} patternUnits="userSpaceOnUse">
          <rect width={18} height={18} fill="#f1e9d2" />
          <path
            d="M9,2 L16,9 L9,16 L2,9 Z"
            fill="none"
            stroke="#1b2a4a"
            strokeWidth={1.25}
          />
          <circle cx={9} cy={9} r={1.6} fill="#a8492f" />
        </pattern>
      </defs>
      <rect width={36} height={18} fill="url(#zpots-azulejo-tile)" />
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

export interface BinderClipProps extends SVGProps<SVGSVGElement> {
  /** Rendered width; height follows the viewBox aspect ratio. Defaults to 56. */
  size?: number;
}

/**
 * Brass binder clip pinning the parchment sheet to the navy board --
 * two overlapping ovals (the clip's outer band and its handle) and a
 * short highlight stroke for the metal sheen. Sits centered over the top
 * edge of `ClipboardShell`'s parchment panel.
 */
export function BinderClip({ size = 56, className, ...props }: BinderClipProps) {
  return (
    <svg
      viewBox="0 0 56 40"
      width={size}
      height={(size * 40) / 56}
      {...props}
      className={className}
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      <ellipse cx={28} cy={14} rx={22} ry={13} fill="#c9962c" stroke="#8a6115" strokeWidth={1.5} />
      <ellipse cx={28} cy={14} rx={22} ry={13} fill="none" stroke="#8a6115" strokeWidth={1} />
      <rect x={20} y={20} width={16} height={18} rx={4} fill="#c9962c" stroke="#8a6115" strokeWidth={1.5} />
      <path d="M12 10 C 18 4, 38 4, 44 10" fill="none" stroke="#e8c274" strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  );
}
