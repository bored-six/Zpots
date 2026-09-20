import type { SVGProps } from "react";

export interface BrandIconProps extends SVGProps<SVGSVGElement> {
  /** Rendered width and height in pixels. Defaults to 18. */
  size?: number;
}

/**
 * Google's "G" mark. Unlike every other icon in this directory, this one is
 * not hand-drawn to the app's own visual language -- it's a recognized
 * brand mark reproduced accurately (official four-color path data), used
 * only to label the "Continue with Google" button. Everything else about
 * that button (shape, type, spacing) stays in the Compass Rose theme.
 */
export function GoogleGIcon({ size = 18, className, ...props }: BrandIconProps) {
  return (
    <svg
      viewBox="0 0 18 18"
      width={size}
      height={size}
      {...props}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.259h2.908c1.702-1.567 2.684-3.874 2.684-6.617z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.348 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}
