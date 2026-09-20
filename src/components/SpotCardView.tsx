"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import Avatar from "@/components/Avatar";
import Bilingual from "@/components/Bilingual";
import ConfirmButton from "@/components/ConfirmButton";
import MapInset from "@/components/MapInset";
import ReportButton from "@/components/ReportButton";
import SignInPrompt from "@/components/SignInPrompt";
import { BookmarkFilledIcon, BookmarkIcon } from "@/components/icons/social-icons";
import SpotPhoto from "@/components/SpotPhoto";
import type { AuthStatus } from "@/lib/auth";
import { bilingualLabel, COPY } from "@/lib/copy";
import { formatDistance } from "@/lib/geo";
import { isPreviewSpot } from "@/lib/preview-spots";
import type { Spot, SpotCard } from "@/lib/spots";
import type { ReportReason } from "@/lib/validation";

interface SpotCardViewProps {
  card: SpotCard;
  /** Whether the signed-in account has already saved this spot. */
  isSaved: boolean;
  /** Whether the signed-in account already confirmed ("been here") this spot. */
  confirmedByMe: boolean;
  onSave: () => void;
  onUnsave: () => void;
  onBeenHere: () => void;
  onReport: (reason: ReportReason, details?: string) => void;
  /**
   * Whether this spot is already on the caller's personal map (own / saved
   * / been) -- the inset only deep-links to `/mapa` when true; otherwise
   * tapping it expands an inline 240px preview instead (social-spots.md,
   * "Spots deck", map inset paragraph). Optional -- defaults to `false` so
   * a caller that doesn't track this yet still gets a working card.
   */
  isOnMyMap?: boolean;
  /**
   * Gates the Save action behind `SignInPrompt` (action="save") when
   * signed out, per social-spots.md ("Readable signed-out ... Everything
   * else gates"). Optional -- defaults to "signed-in" so a caller that
   * doesn't track auth status still gets a working, ungated Save button.
   */
  authStatus?: AuthStatus;
}

const SAVE_BUTTON_BASE_CLASS =
  "inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded px-4 py-1.5 text-sm font-bold";
const SAVE_BUTTON_UNSAVED_CLASS = "border border-cream bg-transparent text-cream hover:bg-cream/10";
const SAVE_BUTTON_SAVED_CLASS = "bg-teal text-cream hover:bg-teal-deep";

/**
 * One full-height card in the Spots deck (social-spots.md, "Spots deck"
 * UI spec). Photo fills the card, a tinta gradient sits over the bottom
 * 40%, and the author, spot details, and actions are overlaid on top of
 * it. Save/been/report are the existing `ConfirmButton`/`ReportButton`
 * primitives reused as-is; only the save toggle is new here.
 */
export default function SpotCardView({
  card,
  isSaved,
  confirmedByMe,
  onSave,
  onUnsave,
  onBeenHere,
  onReport,
  isOnMyMap = false,
  authStatus = "signed-in",
}: SpotCardViewProps) {
  const [insetExpanded, setInsetExpanded] = useState(false);
  const [showSaveGate, setShowSaveGate] = useState(false);
  const router = useRouter();

  const spotBase: Spot = card;
  // A preview spot (famous-places fallback) is read-only: its author has
  // no profile page and its id does not exist server-side, so the profile
  // link and every RPC-backed action are left out rather than gated.
  const isPreview = isPreviewSpot(card.id);
  // Only the English phrase is rendered here (unlike the rest of this
  // card): the Chavacano and English templates would both interpolate the
  // same formatted number, so a Bilingual-style pair would put the exact
  // same substring on the page twice.
  const distanceText =
    card.distanceM != null ? COPY.distanceAway.en.replace("{n}", formatDistance(card.distanceM)) : null;

  const authorBlock = (
    <>
      <Avatar
        handle={card.author.handle}
        avatarUrl={card.author.avatarUrl}
        displayName={card.author.displayName}
        size={40}
      />
      <span className="flex flex-col leading-tight">
        <span className="font-bold text-cream">{card.author.displayName}</span>
        <span className="text-sm text-cream/80">{`@${card.author.handle}`}</span>
      </span>
    </>
  );

  function handleInsetTap() {
    if (isOnMyMap) {
      router.push(`/mapa?spot=${card.id}`);
      return;
    }
    setInsetExpanded((current) => !current);
  }

  function handleSaveClick() {
    if (authStatus === "signed-out") {
      setShowSaveGate(true);
      return;
    }
    onSave();
  }

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-tinta">
      <div className="absolute inset-0">
        <SpotPhoto photoUrl={card.photoUrl} name={card.name} />
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-tinta via-tinta/70 to-transparent" />

      <div className="pointer-events-none absolute right-3 top-3 z-10">
        <div className="pointer-events-auto">
          <MapInset
            center={{ lat: card.lat, lng: card.lng }}
            status={card.status}
            size={insetExpanded ? 240 : 112}
            onExpand={handleInsetTap}
          />
        </div>
      </div>

      <div className="relative mt-auto flex flex-col gap-3 p-4 text-cream">
        {isPreview ? (
          <div className="flex w-fit items-center gap-2">
            {authorBlock}
            <span className="ml-1 rounded-full border border-cream/60 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-cream">
              <Bilingual k="preview" tone="inherit" />
            </span>
          </div>
        ) : (
          <Link href={`/u/${card.author.handle}`} className="flex w-fit items-center gap-2">
            {authorBlock}
          </Link>
        )}

        <div>
          <h2
            className="text-2xl font-bold text-cream"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {card.name}
          </h2>
          <p className="line-clamp-2 text-sm text-cream/90">{card.note}</p>
        </div>

        {distanceText && <p className="text-xs text-cream/80">{distanceText}</p>}

        {isPreview && card.photoCredit && (
          <p className="text-[11px] text-cream/70">{`Foto: ${card.photoCredit}`}</p>
        )}

        <span className="zpots-popup-status w-fit" data-status={card.status}>
          <Bilingual k={card.status === "confirmed" ? "statusConfirmed" : "statusUnconfirmed"} tone="inherit" />
        </span>

        {!isPreview && (
        <div className="flex flex-wrap items-center gap-2">
          {isSaved ? (
            <button
              type="button"
              onClick={onUnsave}
              aria-label={bilingualLabel("saved")}
              className={`${SAVE_BUTTON_BASE_CLASS} ${SAVE_BUTTON_SAVED_CLASS}`}
            >
              <BookmarkFilledIcon size={18} />
              <Bilingual k="saved" tone="inherit" layout="stack" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSaveClick}
              aria-label={bilingualLabel("save")}
              className={`${SAVE_BUTTON_BASE_CLASS} ${SAVE_BUTTON_UNSAVED_CLASS}`}
            >
              <BookmarkIcon size={18} />
              <Bilingual k="save" tone="inherit" layout="stack" />
            </button>
          )}

          <ConfirmButton spot={{ ...spotBase, confirmedByMe }} onConfirm={onBeenHere} />

          <ReportButton spotId={card.id} onReport={onReport} />
        </div>
        )}
      </div>

      {showSaveGate && <SignInPrompt action="save" onDismiss={() => setShowSaveGate(false)} />}
    </div>
  );
}
