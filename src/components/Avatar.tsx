/**
 * `Avatar` (social-spots.md, "Default avatar" design decision): the real
 * photo when `avatarUrl` is set, otherwise initials on a palette
 * background chosen deterministically from the handle -- same slot on the
 * server and the client, no randomness, no clock. `data-palette-index`
 * exposes the chosen slot for tests without asserting on the actual color.
 */

export interface AvatarProps {
  handle: string;
  avatarUrl: string | null;
  /** Used for initials when present; falls back to `handle` otherwise. */
  displayName?: string;
  /** Rendered width and height in pixels. Defaults to 40. */
  size?: number;
  className?: string;
}

/**
 * The five palette tokens from the PRD, in order -- index into this array
 * with the handle's hash, never hardcode a single slot.
 */
const PALETTE_CLASSES = ["bg-teal", "bg-terracotta", "bg-stone-deep", "bg-vinta-blue", "bg-vinta-green"] as const;

/**
 * Small deterministic string hash (djb2-derived). Only used to pick a
 * palette slot, not for anything security-sensitive.
 */
function hashString(value: string): number {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return Math.abs(hash);
}

function paletteIndexFor(handle: string): number {
  return hashString(handle) % PALETTE_CLASSES.length;
}

function initialsFor(source: string): string {
  const trimmed = source.trim();
  if (trimmed.length === 0) return "?";
  return trimmed.slice(0, 2).toUpperCase();
}

export default function Avatar({ handle, avatarUrl, displayName, size = 40, className }: AvatarProps) {
  const paletteIndex = paletteIndexFor(handle);
  const dimension = { width: size, height: size };

  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={`@${handle}`}
        data-palette-index={paletteIndex}
        style={dimension}
        className={`inline-block rounded-full object-cover ${className ?? ""}`}
      />
    );
  }

  const initials = initialsFor(displayName && displayName.trim().length > 0 ? displayName : handle);
  const paletteClass = PALETTE_CLASSES[paletteIndex];

  return (
    <div
      aria-label={`@${handle}`}
      data-palette-index={paletteIndex}
      style={dimension}
      className={`inline-flex items-center justify-center rounded-full text-cream ${paletteClass} ${className ?? ""}`}
    >
      <span aria-hidden="true">{initials}</span>
    </div>
  );
}
