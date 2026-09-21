import { useEffect, useRef, useState } from "react";

/**
 * True for the render span after `confirmed` flips from `false` to `true`
 * while the calling component stays mounted -- and only then.
 *
 * paseo-motion.md fix-round-2 finding 1: a spot that is already confirmed
 * the moment a component first renders it (a deck card scrolling back into
 * the +/-2 window, a popup reopened later, any fresh page load) must never
 * replay the "just confirmed" animation -- there is no prior `false` render
 * to transition from, so this returns `false` for the lifetime of that
 * mount. The only way to observe `true` is to render this component with
 * `confirmed=false` first and then, without unmounting, receive
 * `confirmed=true` -- i.e. the confirm action actually completing and the
 * caller's own state update flowing back down as a prop change. Unmounting
 * and remounting (even with the same still-confirmed spot) resets this
 * hook's internal ref, so a stale confirmation never replays either.
 *
 * Deliberately local per call site rather than global state: nothing in
 * this codebase currently polls or subscribes for a spot's status changing
 * out from under an already-mounted card, so "confirmed flipped while
 * mounted" and "this session's confirm action completed" are the same
 * event in practice. If that ever stops being true (e.g. a realtime
 * subscription lands), this hook would need to be told explicitly instead
 * of inferring the transition from the status prop alone.
 */
export function useJustConfirmed(confirmed: boolean): boolean {
  const wasConfirmedRef = useRef(confirmed);
  const [justConfirmed, setJustConfirmed] = useState(false);

  useEffect(() => {
    if (confirmed && !wasConfirmedRef.current) {
      setJustConfirmed(true);
    }
    wasConfirmedRef.current = confirmed;
  }, [confirmed]);

  return justConfirmed;
}
