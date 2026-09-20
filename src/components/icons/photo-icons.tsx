import type { SVGProps } from "react";

export interface PhotoIconProps extends SVGProps<SVGSVGElement> {
  /** Rendered width and height in pixels. Defaults to 20. */
  size?: number;
}

/**
 * Picture-frame outline with a sun -- stands in for a spot that has no
 * photo yet, or one whose photo failed to load. Hand-drawn, not pulled
 * from an icon pack: a plain frame rectangle and a small sun (circle with
 * short rays) in the lower-left third, the classic "missing image" motif
 * without borrowing a stock glyph.
 */
export function PhotoPlaceholderIcon({ size = 20, className, ...props }: PhotoIconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      {...props}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x={2.5}
        y={3.5}
        width={15}
        height={13}
        rx={1.5}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.4}
      />
      <circle cx={7.5} cy={8.5} r={1.7} fill="none" stroke="currentColor" strokeWidth={1.1} />
      <path
        d="M7.5 5 V5.9 M7.5 11.1 V12 M4 8.5 H4.9 M10.1 8.5 H11 M4.9 5.9 L5.5 6.5 M9.5 11.1 L10.1 11.7 M10.1 5.9 L9.5 6.5 M5.5 10.5 L4.9 11.1"
        stroke="currentColor"
        strokeWidth={0.9}
        strokeLinecap="round"
      />
    </svg>
  );
}
