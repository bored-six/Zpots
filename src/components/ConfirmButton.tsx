"use client";

import { CheckIcon } from "@/components/icons/status-icons";
import type { Spot } from "@/lib/spots";

interface ConfirmButtonProps {
  /**
   * `confirmedByMe` is not part of `Spot` -- it's attached by whoever
   * renders this button, from a local set of already-confirmed spot ids
   * (see spec F9 / learnings.md).
   */
  spot: Spot & { confirmedByMe?: boolean };
  onConfirm: () => void;
}

const BADGE_CLASS =
  "inline-flex items-center gap-1.5 rounded-sm border border-[#0f7a63]/30 bg-[#0f7a63]/10 " +
  "px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[#0f7a63]";

const CTA_CLASS =
  "inline-flex items-center gap-1.5 rounded-sm bg-[#0f7a63] px-3 py-1.5 text-sm font-semibold " +
  "text-white hover:bg-[#0c624f] disabled:cursor-not-allowed disabled:bg-[#c9c6bd] " +
  "disabled:text-[#6f6b60]";

/**
 * "Confirm -- I've been here" control. Once a spot reaches
 * CONFIRMATION_THRESHOLD it renders as a settled Confirmed badge instead
 * of a button; before that, a browser that has already confirmed this
 * spot gets a disabled, distinct state rather than the live call to action.
 */
export default function ConfirmButton({ spot, onConfirm }: ConfirmButtonProps) {
  if (spot.status === "confirmed") {
    return (
      <span className={BADGE_CLASS}>
        <CheckIcon />
        Confirmed
      </span>
    );
  }

  const alreadyConfirmedByMe = Boolean(spot.confirmedByMe);

  return (
    <button
      type="button"
      onClick={onConfirm}
      disabled={alreadyConfirmedByMe}
      className={CTA_CLASS}
    >
      <CheckIcon />
      {alreadyConfirmedByMe ? "You confirmed this spot" : "Confirm — I've been here"}
    </button>
  );
}
