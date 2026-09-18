import type { SVGProps } from "react";

export interface StatusIconProps extends SVGProps<SVGSVGElement> {
  /** Rendered width and height in pixels. Defaults to 16. */
  size?: number;
}

/**
 * Small checkmark used on the "Confirmed" state. A single continuous
 * stroke, same rounded-join language as the map pins, so the two states
 * of a spot (map pin vs. popup control) read as one visual system.
 */
export function CheckIcon({ size = 16, className, ...props }: StatusIconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      {...props}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M3 8.5 L6.5 12 L13 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Small pennant/flag outline for the Report control -- the everyday
 * shorthand for "flag this", drawn plain rather than pulled from an icon
 * pack. Hollow, not filled, so it stays quiet next to the Confirm control.
 */
export function FlagIcon({ size = 16, className, ...props }: StatusIconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      {...props}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M4 2 V14"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <path
        d="M4 2.75 H12.5 L10 6 L12.5 9.25 H4"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Small exclamation glyph used to mark inline validation errors -- plain
 * enough to read at 14px next to a line of error text, never a full stop
 * sign or triangle so it doesn't overstate the severity of "fix this field".
 */
export function AlertIcon({ size = 14, className, ...props }: StatusIconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      {...props}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <circle cx={8} cy={8} r={6.5} fill="none" stroke="currentColor" strokeWidth={1.5} />
      <path d="M8 4.5 V9" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <circle cx={8} cy={11.25} r={0.9} fill="currentColor" stroke="none" />
    </svg>
  );
}
