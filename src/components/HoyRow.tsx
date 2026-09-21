"use client";

import Avatar from "@/components/Avatar";
import type { HoyEntry } from "@/lib/feed-repo";

interface HoyRowProps {
  entries: HoyEntry[];
  onSelect: (spotId: string) => void;
}

/** A post this recent or newer gets the spinning vinta ring (paseo-motion.md,
 * "the vinta ring rotates only for people who posted in the last hour"). */
const FRESH_WINDOW_MS = 60 * 60 * 1000;

/**
 * True when `createdAt` is within `FRESH_WINDOW_MS` of now. A missing or
 * unparseable timestamp is never fresh -- `Date.parse` returns `NaN` for
 * those, and every comparison against `NaN` is false, so this falls through
 * to `false` without throwing.
 */
function isFresh(createdAt: string): boolean {
  const postedAt = Date.parse(createdAt);
  return Date.now() - postedAt < FRESH_WINDOW_MS;
}

/**
 * "Hoy" row under the lane tabs (social-spots.md, "Spots deck"):
 * followees with a spot in the last 24h, each a tappable avatar in a
 * vinta-stripe ring with their handle beneath. Hidden entirely when empty
 * -- callers don't need to know or check that themselves.
 */
export default function HoyRow({ entries, onSelect }: HoyRowProps) {
  if (entries.length === 0) return null;

  return (
    <div className="flex gap-4 overflow-x-auto px-4 py-2">
      {entries.map((entry) => (
        <button
          key={entry.spotId}
          type="button"
          onClick={() => onSelect(entry.spotId)}
          className="flex shrink-0 flex-col items-center gap-1"
        >
          <span
            className="vinta-ring inline-flex rounded-full p-[2px]"
            data-fresh={String(isFresh(entry.createdAt))}
          >
            <Avatar
              handle={entry.author.handle}
              avatarUrl={entry.author.avatarUrl}
              displayName={entry.author.displayName}
              size={48}
            />
          </span>
          <span className="max-w-[56px] truncate text-xs text-stone-deep">{`@${entry.author.handle}`}</span>
        </button>
      ))}
    </div>
  );
}
