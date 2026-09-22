import type { SVGProps } from "react";
import type { SpotCategory } from "@/lib/spots";

export interface PinIconProps extends SVGProps<SVGSVGElement> {
  /** Rendered width and height in pixels. Defaults to 22. */
  size?: number;
}

export type PinStatus = "unconfirmed" | "confirmed";

/**
 * Grabado -- the pin's art style (.claude/handoff/pin-revamp-spec.md
 * section 1): every glyph is a printer's woodblock stamp, one solid ink
 * mass chiselled with tapered knife-cut lights, pressed onto the cream
 * window of the compass rose. See section 3 for the geometry rationale
 * behind each of the six glyph strings below -- they are copied verbatim
 * from the spec and must not be retyped, reformatted, or "tidied".
 *
 * Shared compass-rose-and-tail silhouette (spec section 4.1) -- the brand
 * mark itself is unchanged; character comes from what it carries (the
 * category glyph, the confirmed seal, the density ladder), not from a new
 * silhouette. Anchor point is the tail tip (16, 30).
 */
const ROSE =
  "M16,2 L19.5,13 L16,16 L12.5,13 Z M30,16 L19,19.5 L16,16 L19,12.5 Z M16,30 L12.5,19 L16,16 L19.5,19 Z M2,16 L13,12.5 L16,16 L13,19.5 Z";
const TAIL = "M13.5,22 L16,30 L18.5,22 Z";

/**
 * The seal (confirmed only, spec section 4.3): a band through the rose
 * with twelve chiselled teeth -- the crimped edge of a wax sello. Teeth
 * sit at 15deg + 30deg*k so none touches a kite.
 */
const SEAL_TEETH =
  "M24.89,17.41 L26.24,18.74 L24.4,19.23 Z M22.99,21.66 L23.5,23.5 L21.66,22.99 Z M19.23,24.4 L18.74,26.24 L17.41,24.89 Z M14.59,24.89 L13.26,26.24 L12.77,24.4 Z M10.34,22.99 L8.5,23.5 L9.01,21.66 Z M7.6,19.23 L5.76,18.74 L7.11,17.41 Z M7.11,14.59 L5.76,13.26 L7.6,12.77 Z M9.01,10.34 L8.5,8.5 L10.34,9.01 Z M12.77,7.6 L13.26,5.76 L14.59,7.11 Z M17.41,7.11 L18.74,5.76 L19.23,7.6 Z M21.66,9.01 L23.5,8.5 L22.99,10.34 Z M24.4,12.77 L26.24,13.26 L24.89,14.59 Z";

const VIEW_BOX = "0 0 32 32";

/**
 * The two allowed status hexes (spec section 6) -- stone-deep for
 * unconfirmed ("lapiz", pencilled), teal for confirmed ("sellao", sealed).
 * Status is carried by the chassis only; it never touches the glyph.
 */
const STATUS_COLOR: Record<PinStatus, string> = {
  unconfirmed: "#7a6448",
  confirmed: "#1f6f78",
};

/**
 * The six Grabado glyph path strings (spec section 3), verbatim. Each
 * glyph is exactly two <path> elements: the mass (ink, #2a2017) then the
 * cuts (cream lights knifed out of it, #f6eedc). Never retype or
 * reformat these -- the geometry test (pin-glyphs.geometry.test.ts) parses
 * every vertex back out and checks it against the spec's exact numbers.
 */
export const PIN_GLYPH_PATHS: Record<SpotCategory, { mass: string; cuts: string }> = {
  come: {
    mass: "M16,9 L16.9,10.4 L16.9,22.6 L15.1,22.6 L15.1,10.4 Z M12.8,10.4 H19.2 V13.4 H12.8 Z M12.4,14.4 H19.6 V17.4 H12.4 Z M12.8,18.4 H19.2 V21.4 H12.8 Z",
    cuts: "M13.4,11 H17.8 L13.4,12.4 Z M13,15 H18.2 L13,16.4 Z M13.4,19 H17.8 L13.4,20.4 Z",
  },
  senta: {
    mass: "M10.6,12.6 H21.4 L22.2,15.6 H9.8 Z M11,15.2 H13.4 V21 H11 Z M18.6,15.2 H21 V21 H18.6 Z",
    cuts: "M11.2,13.3 H17.6 L11.2,14.7 Z M11.5,16.4 H12.7 L11.9,20.2 Z",
  },
  camina: {
    mass: "M10.6,20.4 L13.4,15 L14.6,16.4 L16,9.2 L17.4,16.4 L18.6,15 L21.4,20.4 Z",
    cuts: "M15.7,12 L14.6,19.2 H15.7 Z M13,16.6 L12.2,19 H13.2 Z",
  },
  agua: {
    mass: "M9.8,19.6 V15.8 A2.07,2.07 0 0 1 13.93,15.8 A2.07,2.07 0 0 1 18.07,15.8 A2.07,2.07 0 0 1 22.2,15.8 V19.6 Z",
    cuts: "M10.6,17.2 H19.6 L10.6,18.5 Z M10.9,15.5 L12.5,14.3 L11.9,15.9 Z",
  },
  mira: {
    mass: "M20.2,16 A4.2,4.2 0 1 1 11.8,16 A4.2,4.2 0 1 1 20.2,16 Z M20.08,16.43 L22.38,17.71 L19.75,17.67 Z M19.32,18.41 L20.67,20.67 L18.41,19.32 Z M17.67,19.75 L17.71,22.38 L16.43,20.08 Z M15.57,20.08 L14.29,22.38 L14.33,19.75 Z M13.59,19.32 L11.33,20.67 L12.68,18.41 Z M12.25,17.67 L9.62,17.71 L11.92,16.43 Z M11.92,15.57 L9.62,14.29 L12.25,14.33 Z M12.68,13.59 L11.33,11.33 L13.59,12.68 Z M14.33,12.25 L14.29,9.62 L15.57,11.92 Z M16.43,11.92 L17.71,9.62 L17.67,12.25 Z M18.41,12.68 L20.67,11.33 L19.32,13.59 Z M19.75,14.33 L22.38,14.29 L20.08,15.57 Z",
    cuts: "M12.55,15.4 A3.5,3.5 0 0 1 15.4,12.55 A2.8,2.8 0 0 1 12.55,15.4 Z",
  },
  compra: {
    mass: "M10.2,13.2 H21.8 L20,20.6 H12 Z M11.8,13.6 V13.2 A4.2,4.2 0 0 1 20.2,13.2 V13.6 H18.6 V13.2 A2.6,2.6 0 0 0 13.4,13.2 V13.6 Z",
    cuts: "M11,14.4 H18.8 L11,15.7 Z M11.9,17.2 H17.6 L12.1,18.5 Z M12.6,19.2 H15.4 L12.8,20 Z",
  },
};

/**
 * `<g data-glyph="{category}">` with exactly the two Grabado paths -- mass
 * then cuts, no other attributes on the group (spec section 3, 7.4). The
 * chassis carries status; this carries category. They never share a
 * channel, so mass is always ink (#2a2017) and cuts are always cream
 * (#f6eedc) -- never `currentColor`, never a status color.
 */
export function PinGlyph({ category }: { category: SpotCategory }) {
  const { mass, cuts } = PIN_GLYPH_PATHS[category];
  return (
    <g data-glyph={category}>
      <path fill="#2a2017" d={mass} />
      <path fill="#f6eedc" d={cuts} />
    </g>
  );
}

export interface PinChassisProps extends SVGProps<SVGSVGElement> {
  /** Rendered width and height in pixels. Defaults to 22. */
  size?: number;
  status: PinStatus;
  /** closed: no window. open: cream window + category glyph. */
  mode: "closed" | "open";
  /** Only drawn when mode is "open". */
  category?: SpotCategory;
  /** Flags this as the render right after a pin flipped Unconfirmed -> Confirmed (the "sello" moment, spec section 4.7). No-op when status is "unconfirmed". */
  justConfirmed?: boolean;
}

/**
 * The pin chassis: rose + tail, status styling, and -- for confirmed pins --
 * the seal. Layer order is fixed (spec section 4.4) and the halo is always
 * the first <path> so `pin-icon.ts` can rely on that when it needs to reach
 * the first element in the serialized markup.
 */
export function PinChassis({
  size = 22,
  status,
  mode,
  category,
  justConfirmed,
  className,
  ...rest
}: PinChassisProps) {
  const statusColor = STATUS_COLOR[status];
  const isConfirmed = status === "confirmed";

  const roseFillProps = isConfirmed
    ? { fill: statusColor, stroke: statusColor, strokeWidth: 1 }
    : { fill: "#f6eedc", fillOpacity: 0.85, stroke: statusColor, strokeWidth: 2 };

  const sealClassName = justConfirmed
    ? "zpots-seal zpots-pin-icon--just-confirmed"
    : "zpots-seal";

  return (
    <svg
      viewBox={VIEW_BOX}
      width={size}
      height={size}
      {...rest}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={`${ROSE} ${TAIL}`}
        fill="none"
        stroke="#f6eedc"
        strokeOpacity={0.95}
        strokeWidth={3.2}
        strokeLinejoin="round"
      />
      <path d={ROSE} {...roseFillProps} strokeLinejoin="round" />
      <path d={TAIL} {...roseFillProps} strokeLinejoin="round" />

      {mode === "closed" &&
        (isConfirmed ? (
          <circle cx={16} cy={16} r={2} fill="#f6eedc" />
        ) : (
          <circle cx={16} cy={16} r={1.6} fill="none" stroke={statusColor} strokeWidth={1.4} />
        ))}

      {mode === "open" && (
        <>
          {isConfirmed ? (
            <circle cx={16} cy={16} r={8.5} fill="#f6eedc" />
          ) : (
            <circle cx={16} cy={16} r={8.5} fill="#f6eedc" stroke={statusColor} strokeWidth={1.2} />
          )}
          {category && <PinGlyph category={category} />}
        </>
      )}

      {isConfirmed && (
        <g className={sealClassName} data-part="seal">
          <circle cx={16} cy={16} r={8.5} fill="none" stroke="#1f6f78" strokeWidth={1.4} />
          <path fill="#1f6f78" d={SEAL_TEETH} />
        </g>
      )}

      {isConfirmed && justConfirmed && (
        <circle
          cx={16}
          cy={16}
          r={9.5}
          fill="none"
          stroke="#1f6f78"
          strokeWidth={1.4}
          className="zpots-seal-pulse"
        />
      )}
    </svg>
  );
}

/**
 * Punto azulejo (spec section 14.5): the rose's own degradation curve at
 * 10px -- Grabado's lights-close-first-mass-remains physics applied to the
 * rose's own concavities leaves its convex hull, a lozenge. Borrows the
 * azulejo/Talavera lattice cell's shape (not the `AzulejoBand` component
 * itself) because an ornament unit, not an object, is right for a mark that
 * carries no category -- only presence and status. Exactly two <path>
 * elements, halo first, anchored at its own centre (not the tail tip).
 */
export function PuntoPin({ size = 10, status }: { size?: number; status: PinStatus }) {
  return (
    <svg viewBox={VIEW_BOX} width={size} height={size} aria-hidden="true" focusable="false">
      <path d="M16,1 L31,16 L16,31 L1,16 Z" fill="#f6eedc" />
      {status === "confirmed" ? (
        <path d="M16,4 L28,16 L16,28 L4,16 Z" fill="#1f6f78" />
      ) : (
        <path
          d="M16,4 L28,16 L16,28 L4,16 Z"
          fill="#f6eedc"
          fillOpacity={0.85}
          stroke="#7a6448"
          strokeWidth={3}
        />
      )}
    </svg>
  );
}

// Kept for the frozen adversarial test (bare render, default size 22, no console.error):
export function UnconfirmedPin(props: PinIconProps) {
  return <PinChassis {...props} status="unconfirmed" mode="closed" />;
}

export function ConfirmedPin(props: PinIconProps) {
  return <PinChassis {...props} status="confirmed" mode="closed" />;
}
