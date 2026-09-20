import { COPY, type CopyKey } from "@/lib/copy";

interface BilingualProps {
  k: CopyKey;
  /**
   * "muted" (default) is `text-stone-deep` for text sitting on a light
   * cream surface. "inherit" is `text-current opacity-75` for text inside
   * a filled terracotta/teal button, where `text-stone-deep` would fail
   * contrast against the button's own background and the button already
   * sets a light text color the English span should just dim slightly.
   */
  tone?: "muted" | "inherit";
  /**
   * "inline" (default) keeps both spans on one line. "stack" renders them
   * as two blocks -- primary `whitespace-nowrap`, English small and
   * tight-leading beneath it -- for controls where a short Chavacano
   * phrase must never wrap mid-phrase (the confirm CTA, the report
   * button).
   */
  layout?: "inline" | "stack";
}

const TONE_CLASS = {
  muted: "text-stone-deep",
  inherit: "text-current opacity-75",
} as const;

/**
 * Renders a copy entry as Chavacano primary + English secondary text. The
 * Chavacano span is `aria-hidden` so it never doubles up the accessible
 * name -- whatever element wraps this (a button, a heading) is responsible
 * for setting its own `aria-label` to the English string via
 * `bilingualLabel(k)` so English-name queries keep resolving.
 */
export default function Bilingual({ k, tone = "muted", layout = "inline" }: BilingualProps) {
  const entry = COPY[k];
  const toneClass = TONE_CLASS[tone];

  if (layout === "stack") {
    return (
      <>
        <span aria-hidden="true" className="block whitespace-nowrap">
          {entry.cv}
        </span>
        <span className={`block text-[11px] leading-tight ${toneClass}`}>{entry.en}</span>
      </>
    );
  }

  return (
    <>
      <span aria-hidden="true">{entry.cv}</span>{" "}
      <span className={`text-[0.7em] ${toneClass}`}>{entry.en}</span>
    </>
  );
}
