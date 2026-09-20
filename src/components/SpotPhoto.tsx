"use client";

import { useState } from "react";

import { PhotoPlaceholderIcon } from "@/components/icons/photo-icons";

interface SpotPhotoProps {
  photoUrl?: string;
  name: string;
}

const IMG_CLASS = "zpots-popup-photo w-full max-h-40 rounded border border-stone object-cover";
const PLACEHOLDER_CLASS =
  "zpots-popup-photo flex h-24 items-center justify-center rounded border border-stone " +
  "bg-cream-deep text-stone-deep";

/**
 * A spot's popup photo, or a placeholder when there is none or it failed
 * to load. Lives in its own client component (rather than inline in
 * SpotMap.tsx) because a react-leaflet Popup renders through Leaflet's own
 * DOM, and the `onError` -> placeholder swap needs local state that
 * survives independently of the parent SpotMap re-rendering.
 */
export default function SpotPhoto({ photoUrl, name }: SpotPhotoProps) {
  const [hasErrored, setHasErrored] = useState(false);

  if (!photoUrl || hasErrored) {
    return (
      <div data-testid="photo-placeholder" className={PLACEHOLDER_CLASS}>
        <PhotoPlaceholderIcon />
      </div>
    );
  }

  return (
    // A Leaflet popup sizes itself around its content, so there's no fixed
    // width/height to hand next/image -- a plain <img> is the correct fit.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photoUrl}
      alt={`Photo of ${name}`}
      className={IMG_CLASS}
      onError={() => setHasErrored(true)}
    />
  );
}
