import type { SVGProps } from "react";

export interface NavIconProps extends SVGProps<SVGSVGElement> {
  /** Rendered width and height in pixels. Defaults to 24. */
  size?: number;
}

const VIEW_BOX = "0 0 24 24";

/**
 * Same compass-rose silhouette as `pin-icons.tsx` (four kite-shaped points
 * at N/E/S/W plus a center dot), redrawn at 3/4 scale into this module's
 * 24-unit nav viewBox instead of the map pin's 32-unit one and without the
 * pin's anchor tail -- a nav tab icon has no map coordinate to point at.
 * Filled solid (`currentColor`) so it reads clearly at bottom-bar size.
 */
const NORTH_POINT = "M12,1.5 L14.625,9.75 L12,12 L9.375,9.75 Z";
const EAST_POINT = "M22.5,12 L14.25,14.625 L12,12 L14.25,9.375 Z";
const SOUTH_POINT = "M12,22.5 L9.375,14.25 L12,12 L14.625,14.25 Z";
const WEST_POINT = "M1.5,12 L9.75,9.375 L12,12 L9.75,14.625 Z";
const COMPASS_ROSE = `${NORTH_POINT} ${EAST_POINT} ${SOUTH_POINT} ${WEST_POINT}`;

export function SpotsIcon({ size = 24, className, ...props }: NavIconProps) {
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
      <path d={COMPASS_ROSE} fill="currentColor" stroke="currentColor" strokeWidth={0.75} strokeLinejoin="round" />
      <circle cx={12} cy={12} r={1.4} fill="none" stroke="currentColor" strokeWidth={1.1} />
    </svg>
  );
}

/**
 * Folded paper map: an outer panel outline with two vertical fold creases,
 * a hand-drawn take on the classic "map" glyph rather than a flat rectangle
 * so it stays legible next to the other nav icons at small sizes.
 */
export function MapIcon({ size = 24, className, ...props }: NavIconProps) {
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
        d="M3.5,5.5 L9,3.5 L15,5.5 L20.5,3.5 V18.5 L15,20.5 L9,18.5 L3.5,20.5 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path d="M9,3.5 V18.5 M15,5.5 V20.5" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" />
    </svg>
  );
}

/**
 * Camera body with a small top viewfinder hump and a round lens -- the
 * center nav item for the camera-first post flow.
 */
export function CameraIcon({ size = 24, className, ...props }: NavIconProps) {
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
        d="M9,4.5 H15 L16.5,7 H20 a1.5,1.5 0 0 1 1.5,1.5 V18 a1.5,1.5 0 0 1 -1.5,1.5 H4 a1.5,1.5 0 0 1 -1.5,-1.5 V8.5 a1.5,1.5 0 0 1 1.5,-1.5 H7.5 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <circle cx={12} cy={13} r={3.6} fill="none" stroke="currentColor" strokeWidth={1.6} />
    </svg>
  );
}

/**
 * Two overlapping figures (head + shoulder arc each) for the Gente tab --
 * the back figure is drawn first and set back slightly so the front one
 * reads as "in front" without needing fill tricks.
 */
export function PeopleIcon({ size = 24, className, ...props }: NavIconProps) {
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
      <circle cx={16} cy={8.5} r={2.6} fill="none" stroke="currentColor" strokeWidth={1.4} />
      <path
        d="M11.5,20 C11.5,16 13.3,13.4 16,13.4 C18.7,13.4 20.5,16 20.5,20"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinecap="round"
      />
      <circle cx={9} cy={7.5} r={3.2} fill="none" stroke="currentColor" strokeWidth={1.7} />
      <path
        d="M3.5,20.5 C3.5,15.8 5.9,12.6 9,12.6 C12.1,12.6 14.5,15.8 14.5,20.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Single figure (head + shoulder arc) for the Yo/Me tab -- same drawing
 * language as `PeopleIcon`'s front figure, alone, so the two icons read as
 * one system rather than unrelated glyphs.
 */
export function MeIcon({ size = 24, className, ...props }: NavIconProps) {
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
      <circle cx={12} cy={7.5} r={3.6} fill="none" stroke="currentColor" strokeWidth={1.7} />
      <path
        d="M4.5,20.5 C4.5,15.5 7.4,12.2 12,12.2 C16.6,12.2 19.5,15.5 19.5,20.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
      />
    </svg>
  );
}
