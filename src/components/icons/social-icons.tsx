import type { SVGProps } from "react";

export interface SocialIconProps extends SVGProps<SVGSVGElement> {
  /** Rendered width and height in pixels. Defaults to 24. */
  size?: number;
}

const VIEW_BOX = "0 0 24 24";

/** Classic ribbon-bookmark silhouette, notched at the bottom -- shared by
 * both save icons below so the outline and filled states are the exact
 * same shape, only the fill differs. */
const BOOKMARK_RIBBON = "M6,3 H18 V21 L12,16.5 L6,21 Z";

/** Hollow "Guarda" (save) control -- unfilled ribbon. */
export function BookmarkIcon({ size = 24, className, ...props }: SocialIconProps) {
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
      <path d={BOOKMARK_RIBBON} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" />
    </svg>
  );
}

/** Filled "Guardao" (saved) state -- identical ribbon, solid fill. */
export function BookmarkFilledIcon({ size = 24, className, ...props }: SocialIconProps) {
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
      <path d={BOOKMARK_RIBBON} fill="currentColor" stroke="currentColor" strokeWidth={1} strokeLinejoin="round" />
    </svg>
  );
}

/**
 * "Camina con" (follow) glyph: a single walking figure (head, torso, one
 * bent leading leg) paired with a small plus mark, echoing the walking
 * idiom of the copy itself rather than a generic person+plus pack icon.
 */
export function FollowIcon({ size = 24, className, ...props }: SocialIconProps) {
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
      <circle cx={9} cy={5.5} r={2.4} fill="none" stroke="currentColor" strokeWidth={1.6} />
      <path
        d="M5,19 C5,14.6 6.8,11.8 9,11.8 C11.2,11.8 13,14.6 13,19"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
      />
      <path d="M19,7 V13 M16,10 H22" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
    </svg>
  );
}
