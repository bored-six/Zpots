"use client";

import Bilingual from "@/components/Bilingual";
import { CheckIcon } from "@/components/icons/status-icons";
import { bilingualLabel } from "@/lib/copy";
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
  "inline-flex items-center gap-1.5 rounded-full bg-teal px-3 py-1.5 text-xs font-bold " +
  "uppercase tracking-wide text-cream";

const CTA_CLASS =
  "inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded bg-terracotta px-4 " +
  "py-1.5 text-sm font-bold text-cream hover:bg-terracotta-deep disabled:cursor-not-allowed " +
  "disabled:bg-stone disabled:text-stone-deep";

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
        <Bilingual k="statusConfirmed" />
      </span>
    );
  }

  const alreadyConfirmedByMe = Boolean(spot.confirmedByMe);

  return (
    <button
      type="button"
      onClick={onConfirm}
      disabled={alreadyConfirmedByMe}
      // Kept as a literal label (not just bilingualLabel("confirmVisit")):
      // the frozen regression test queries /confirm.*been here/i, which
      // "I've been here" alone would not satisfy.
      aria-label={alreadyConfirmedByMe ? "You confirmed this spot" : `Confirm — ${bilingualLabel("confirmVisit")}`}
      className={CTA_CLASS}
    >
      <CheckIcon />
      {alreadyConfirmedByMe ? (
        "You confirmed this spot"
      ) : (
        <Bilingual k="confirmVisit" tone="inherit" layout="stack" />
      )}
    </button>
  );
}
