import { COPY, type CopyKey } from "@/lib/copy";

interface BilingualProps {
  k: CopyKey;
}

/**
 * Renders a copy entry as Chavacano primary + English secondary text. The
 * Chavacano span is `aria-hidden` so it never doubles up the accessible
 * name -- whatever element wraps this (a button, a heading) is responsible
 * for setting its own `aria-label` to the English string via
 * `bilingualLabel(k)` so English-name queries keep resolving.
 */
export default function Bilingual({ k }: BilingualProps) {
  const entry = COPY[k];

  return (
    <>
      <span aria-hidden="true">{entry.cv}</span>{" "}
      <span className="text-[0.7em] text-stone-deep">{entry.en}</span>
    </>
  );
}
