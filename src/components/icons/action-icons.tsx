import type { SVGProps } from "react";

export interface ActionIconProps extends SVGProps<SVGSVGElement> {
  /** Rendered width and height in pixels. Defaults to 20. */
  size?: number;
}

/**
 * Compass-rose family glyph for "sign in": a doorway arch with a single
 * long diamond needle pointing through it -- reads as "step through". No
 * third-party icon pack.
 */
export function SignInIcon({ size = 20, className, ...props }: ActionIconProps) {
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
      <path
        d="M12,5 H8 a2,2 0 0 0 -2,2 V25 a2,2 0 0 0 2,2 H12"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16 16 H26 M21 11 L26 16 L21 21"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
