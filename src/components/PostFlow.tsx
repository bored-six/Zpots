"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { LeafletMouseEvent, Map as LeafletMap } from "leaflet";
import { MapContainer, Marker, TileLayer } from "react-leaflet";

import Link from "next/link";

import { useAuth } from "@/components/AuthProvider";
import Bilingual from "@/components/Bilingual";
import { AlertIcon } from "@/components/icons/status-icons";
import { CameraIcon } from "@/components/icons/nav-icons";
import { bilingualLabel } from "@/lib/copy";
import { isWithinZamboangaCity } from "@/lib/city-bounds";
import {
  MAX_BOUNDS,
  MAX_ZOOM,
  MIN_ZOOM,
  TILE_ATTRIBUTION,
  TILE_URL,
} from "@/lib/map-config";
import { createPinIcon } from "@/lib/pin-icon";
import { createSpot } from "@/lib/spots-repo";
import { useLocation } from "@/lib/use-location";
import {
  MAX_NAME_LENGTH,
  MAX_NOTE_LENGTH,
  validateNewSpot,
  type NewSpotInput,
  type NewSpotValidationErrors,
} from "@/lib/validation";

const FIELD_LABEL_CLASS = "text-xs font-bold uppercase tracking-[0.12em] text-cream";
const FIELD_INPUT_CLASS =
  "w-full min-h-11 rounded border border-cream/40 bg-cream/95 px-3 py-2 text-sm text-ink " +
  "placeholder:text-stone-deep focus:outline-none";
const TAP_MAP_ZOOM = 15;

function ErrorText({ message }: { message: string }) {
  return (
    <p className="flex items-center gap-1.5 text-[0.8125rem] font-medium text-cardinal">
      <AlertIcon className="shrink-0" />
      <span>{message}</span>
    </p>
  );
}

function objectUrlFor(file: File): string | null {
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return null;
  try {
    return URL.createObjectURL(file);
  } catch {
    return null;
  }
}

/**
 * Camera-first post flow (social-spots.md "Post" UI spec): step 1 is a
 * camera pane (primary "Saca foto" behind a `capture="environment"` file
 * input, secondary "Escoge foto" behind a plain one); picking a photo
 * reveals step 2 -- name/note over the photo's bottom third plus a
 * "Donde este?" location chip. GPS drives location silently when it's a
 * real, in-city fix; otherwise (denied, or a fix outside the city) a small
 * tap map takes over, reusing SpotMap's tap-guard pattern.
 */
export default function PostFlow() {
  const router = useRouter();
  const { status, user } = useAuth();
  const location = useLocation();

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<NewSpotValidationErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);

  const [leafletMap, setLeafletMap] = useState<LeafletMap | null>(null);
  const [tappedLocation, setTappedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [showOutsideCityBanner, setShowOutsideCityBanner] = useState(false);

  const cameraInputRef = useRef<HTMLInputElement>(null);

  const photoPreviewUrl = useMemo(() => (photoFile ? objectUrlFor(photoFile) : null), [photoFile]);

  useEffect(() => {
    return () => {
      if (photoPreviewUrl && typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(photoPreviewUrl);
      }
    };
  }, [photoPreviewUrl]);

  // Only listens once the real Leaflet Map instance is available (never
  // happens under the mocked react-leaflet in PostFlow.test.tsx, which
  // doesn't forward a ref) -- same tap-guard shape as SpotMap.tsx.
  useEffect(() => {
    if (!leafletMap) return;

    function handleMapClick(event: LeafletMouseEvent) {
      const { lat, lng } = event.latlng;
      if (!isWithinZamboangaCity(lat, lng)) {
        setShowOutsideCityBanner(true);
        setTimeout(() => setShowOutsideCityBanner(false), 3000);
        return;
      }
      setTappedLocation({ lat, lng });
      setShowOutsideCityBanner(false);
    }

    leafletMap.on("click", handleMapClick);
    return () => {
      leafletMap.off("click", handleMapClick);
    };
  }, [leafletMap]);

  function handlePhotoPicked(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (file) setPhotoFile(file);
  }

  // A real, in-city GPS fix is used silently; a denied/unavailable fix
  // (isFallback) or a fix that lands outside the city always surfaces the
  // tap map, even when the fallback coordinates themselves happen to sit
  // inside city bounds (social-spots.md "Geolocation" decision).
  const showLocationMap =
    location.isFallback || !isWithinZamboangaCity(location.coords.lat, location.coords.lng);
  const resolvedCoords = tappedLocation ?? location.coords;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const input: NewSpotInput = {
      name,
      note,
      lat: resolvedCoords.lat,
      lng: resolvedCoords.lng,
      photoFile,
      ...(user?.nickname ? { nickname: user.nickname } : {}),
    };

    const result = validateNewSpot(input);
    if (!result.valid) {
      setErrors(result.errors);
      return;
    }

    setErrors({});
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const spot = await createSpot(input);
      setToastVisible(true);
      setTimeout(() => setToastVisible(false), 3000);
      router.push(`/?spot=${spot.id}`);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (status === "signed-out") {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <p className="text-sm text-ink">
          Dropping a pin needs an account, so people can trust what&rsquo;s on the map.
        </p>
        <Link
          href="/login?next=/post"
          className="inline-flex min-h-11 items-center justify-center rounded bg-terracotta px-5 py-2.5 text-sm font-bold text-cream hover:bg-terracotta-deep"
        >
          Sign in
        </Link>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="flex min-h-[50vh] w-full items-center justify-center text-sm text-stone-deep">
        <Bilingual k="loading" />
      </div>
    );
  }

  if (!photoFile) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-10">
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handlePhotoPicked}
          className="hidden"
        />
        <input
          id="post-choose-photo"
          type="file"
          accept="image/*"
          onChange={handlePhotoPicked}
          className="hidden"
        />

        <div className="flex h-56 w-full max-w-xs items-center justify-center rounded-[6px] border border-dashed border-stone bg-cream-deep text-stone-deep">
          <CameraIcon size={40} />
        </div>

        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          aria-label={bilingualLabel("takePhoto")}
          className="inline-flex min-h-11 w-full max-w-xs items-center justify-center gap-2 rounded bg-terracotta px-4 py-2.5 text-sm font-bold text-cream hover:bg-terracotta-deep"
        >
          <CameraIcon />
          <Bilingual k="takePhoto" tone="inherit" />
        </button>

        <label
          htmlFor="post-choose-photo"
          className="inline-flex min-h-10 w-full max-w-xs cursor-pointer items-center justify-center rounded border border-stone px-4 py-2 text-sm font-bold text-ink hover:bg-cream-deep"
        >
          <Bilingual k="choosePhoto" />
        </label>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="relative flex w-full flex-col gap-4">
      <div
        className="relative h-72 w-full overflow-hidden rounded-[6px] border border-stone bg-cream-deep bg-cover bg-center"
        style={photoPreviewUrl ? { backgroundImage: `url(${photoPreviewUrl})` } : undefined}
      >
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 bg-tinta/70 p-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="post-name" className={FIELD_LABEL_CLASS}>
              Name
            </label>
            <input
              id="post-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="What do locals call this place?"
              maxLength={MAX_NAME_LENGTH + 20}
              className={FIELD_INPUT_CLASS}
            />
            {errors.name && <ErrorText message={errors.name} />}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="post-note" className={FIELD_LABEL_CLASS}>
              Note
            </label>
            <textarea
              id="post-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="A short line for someone standing here for the first time."
              rows={2}
              maxLength={MAX_NOTE_LENGTH + 20}
              className={`${FIELD_INPUT_CLASS} resize-none`}
            />
            {errors.note && <ErrorText message={errors.note} />}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded border border-stone bg-cream-deep px-4 py-3">
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-stone bg-cream px-3 py-1 text-xs font-bold text-ink">
          <Bilingual k="whereIsIt" />
        </span>

        {location.isFallback && (
          <p className="text-xs text-stone-deep">
            <Bilingual k="usingCenter" />
          </p>
        )}

        {!location.isFallback && showLocationMap && (
          <p className="text-xs text-stone-deep">
            <Bilingual k="outsideCity" />
          </p>
        )}

        {(errors.lat || errors.lng) && <ErrorText message={errors.lat ?? errors.lng ?? ""} />}

        {showLocationMap && (
          <div className="relative h-[240px] w-full overflow-hidden rounded border border-stone">
            <MapContainer
              ref={setLeafletMap}
              center={[resolvedCoords.lat, resolvedCoords.lng]}
              zoom={TAP_MAP_ZOOM}
              minZoom={MIN_ZOOM}
              maxZoom={MAX_ZOOM}
              maxBounds={MAX_BOUNDS}
              maxBoundsViscosity={1.0}
              scrollWheelZoom={false}
              className="h-full w-full grayscale"
            >
              <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
              {tappedLocation && (
                <Marker
                  position={[tappedLocation.lat, tappedLocation.lng]}
                  icon={createPinIcon("unconfirmed")}
                />
              )}
            </MapContainer>

            {showOutsideCityBanner && (
              <div className="absolute inset-x-0 top-2 z-[1000] mx-auto w-fit rounded-full border border-stone bg-cream px-3 py-1 text-xs font-medium text-ink">
                <Bilingual k="outsideCity" />
              </div>
            )}
          </div>
        )}
      </div>

      {submitError && <ErrorText message={submitError} />}

      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex min-h-11 w-full items-center justify-center rounded bg-terracotta px-4 py-2.5 text-sm font-bold text-cream hover:bg-terracotta-deep disabled:opacity-60"
      >
        <Bilingual k="addSpot" tone="inherit" />
      </button>

      {toastVisible && (
        <div className="zpots-shadow fixed inset-x-0 bottom-6 z-[1200] mx-auto w-fit rounded-full border border-stone bg-cream px-4 py-2 text-sm font-bold text-ink">
          <Bilingual k="spotIsUp" />
        </div>
      )}
    </form>
  );
}
