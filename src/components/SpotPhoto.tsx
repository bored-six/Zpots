"use client";

import { useState } from "react";

import { PhotoPlaceholderIcon } from "@/components/icons/photo-icons";

type SpotPhotoVariant = "popup" | "fill";

interface SpotPhotoProps {
  photoUrl?: string;
  name: string;
  /**
   * "popup" (default): the Leaflet popup's bounded styling -- capped
   * height, border, radius. "fill": full-bleed, sized by its parent --
   * used by the Paseo deck card (SpotCardView), whose photo fills the
   * whole card behind the tinta veil and needs room for Ken Burns drift
   * (.paseo-photo/.paseo-ken-burns in globals.css) without the popup's
   * 160px cap clipping it.
   */
  variant?: SpotPhotoVariant;
}

const IMG_CLASS: Record<SpotPhotoVariant, string> = {
  popup: "zpots-popup-photo w-full max-h-40 rounded border border-stone object-cover",
  fill: "h-full w-full object-cover",
};

const PLACEHOLDER_CLASS: Record<SpotPhotoVariant, string> = {
  popup:
    "zpots-popup-photo flex h-24 items-center justify-center rounded border border-stone " +
    "bg-cream-deep text-stone-deep",
  fill: "flex h-full w-full items-center justify-center bg-cream-deep text-stone-deep",
};

/**
 * A spot's photo, or a placeholder when there is none or it failed to
 * load. Lives in its own client component (rather than inline in its
 * callers) because a react-leaflet Popup renders through Leaflet's own
 * DOM, and the `onError` -> placeholder swap needs local state that
 * survives independently of the parent's re-rendering.
 */
export default function SpotPhoto({ photoUrl, name, variant = "popup" }: SpotPhotoProps) {
  const [hasErrored, setHasErrored] = useState(false);

  if (!photoUrl || hasErrored) {
    return (
      <div data-testid="photo-placeholder" className={PLACEHOLDER_CLASS[variant]}>
        <PhotoPlaceholderIcon />
      </div>
    );
  }

  return (
    // A Leaflet popup sizes itself around its content, and the Paseo card
    // fills an absolutely positioned parent -- neither has a fixed
    // width/height to hand next/image, so a plain <img> is the correct fit.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photoUrl}
      alt={`Photo of ${name}`}
      className={IMG_CLASS[variant]}
      onError={() => setHasErrored(true)}
    />
  );
}
