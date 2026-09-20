"use client";

import Avatar from "@/components/Avatar";
import type { HoyEntry } from "@/lib/feed-repo";

interface HoyRowProps {
  entries: HoyEntry[];
  onSelect: (spotId: string) => void;
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
          <span className="vinta-ring inline-flex rounded-full p-[2px]">
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
