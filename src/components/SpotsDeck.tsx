"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { useAuth } from "@/components/AuthProvider";
import Bilingual from "@/components/Bilingual";
import HoyRow from "@/components/HoyRow";
import { StoneArch } from "@/components/icons/ornaments";
import SpotCardView from "@/components/SpotCardView";
import { bilingualLabel } from "@/lib/copy";
import { feedCerca, feedNuevo, feedSiguiendo, hoyRow, type FeedCursor, type HoyEntry } from "@/lib/feed-repo";
import { isPreviewSpot, previewCards } from "@/lib/preview-spots";
import { mySavedIds, saveSpot, unsaveSpot } from "@/lib/saves-repo";
import type { SpotCard } from "@/lib/spots";
import { confirmSpot, fetchMyConfirmedSpotIds, reportSpot } from "@/lib/spots-repo";
import { useLocation } from "@/lib/use-location";
import type { ReportReason } from "@/lib/validation";

type Lane = "cerca" | "nuevo" | "siguiendo";

/**
 * Where an `activeIndex` change came from -- the deck's own arrow keys, a
 * Hoy tap, or the `?spot=` deep link ("programmatic") versus the
 * IntersectionObserver adopting whatever slot the user's own scroll
 * gesture already settled on ("observed"). Only a programmatic move should
 * ever call `scrollIntoView`; the viewport is already correct for an
 * observed one (paseo-motion.md Finding 3).
 */
type ActiveMoveOrigin = "programmatic" | "observed";

interface ActiveMove {
  index: number;
  origin: ActiveMoveOrigin;
}

const LANES: readonly Lane[] = ["cerca", "nuevo", "siguiendo"];
const PAGE_SIZE = 10;
/** Prefetch the next page once the active card is this close to the end. */
const PREFETCH_THRESHOLD = 3;
/** At most this many cards on either side of the active one stay mounted. */
const WINDOW_RADIUS = 2;
/** IntersectionObserver ratio a snap slot must clear to become the active card. */
const ACTIVE_VISIBILITY_THRESHOLD = 0.6;
/**
 * Last-resort safety net for the destination guard (see
 * `programmaticTargetRef`): how long it stays armed if NEITHER the
 * IntersectionObserver confirms arrival at the target NOR a genuine user
 * gesture cancels it first (see the `wheel`/`touchstart`/`pointerdown`
 * listeners below). In practice this branch is for pathological cases --
 * no real `scrollIntoView` support (jsdom, SSR) or the observer never
 * firing at all -- not for interrupted gestures, which the listeners
 * already resolve immediately. `scrollIntoView({behavior:"smooth"})`
 * duration is browser-controlled and unbounded for a long jump (a Hoy tap
 * can cross many cards), so this value can never reliably outrace it; it
 * doesn't need to, since it no longer carries the "was this interrupted"
 * decision. The exact number is unimportant as long as it's short enough
 * that a genuinely stuck guard (the rare case) clears in a human-noticeable
 * amount of time.
 */
const PROGRAMMATIC_SCROLL_SETTLE_MS = 600;

const TAB_BASE_CLASS =
  "min-h-10 rounded-full px-4 py-1.5 text-sm font-bold uppercase tracking-wide transition";
const TAB_ACTIVE_CLASS = "bg-teal text-cream";
const TAB_INACTIVE_CLASS = "bg-transparent text-stone-deep hover:bg-cream-deep";

function laneCopyKey(lane: Lane): "cerca" | "nuevo" | "siguiendo" {
  return lane;
}

/**
 * Full-screen Spots deck (social-spots.md, "Spots deck" UI spec): one
 * lane's spots, one card per swipe, ordered by the lane's own rule. Owns
 * paging, the Hoy row, the Siguiendo sign-in gate, keyboard navigation,
 * the `?spot=` deep link, and optimistic save/been actions -- everything
 * `SpotCardView` itself has no way to know about on its own.
 */
interface SpotsDeckProps {
  /**
   * Reports the currently active card whenever it changes -- used on
   * desktop (`app/page.tsx`) to pan the right-column map to it. Optional:
   * the deck works exactly the same without a listener.
   */
  onActiveCardChange?: (card: SpotCard | null) => void;
}

export default function SpotsDeck({ onActiveCardChange }: SpotsDeckProps = {}) {
  const auth = useAuth();
  const location = useLocation();
  const searchParams = useSearchParams();
  const deepLinkSpotId = searchParams.get("spot");
  const deepLinkConsumedRef = useRef(false);

  const [lane, setLane] = useState<Lane>("cerca");
  const [cards, setCards] = useState<SpotCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  /** True while the deck is showing the famous-places preview instead of a real (empty) lane. */
  const [isPreview, setIsPreview] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  // Starts as "observed", not "programmatic": there's no slot rendered yet
  // to scroll to at mount (no data has loaded), and "programmatic" here
  // would arm the mid-flight guard against index 0 before anything real
  // ever asked to move there, silently swallowing the first genuine
  // observed move until it happened to land back on index 0 or the settle
  // timer expired.
  const [activeMove, setActiveMove] = useState<ActiveMove>({ index: 0, origin: "observed" });
  const activeIndex = activeMove.index;
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set());
  const [hoyEntries, setHoyEntries] = useState<HoyEntry[]>([]);
  const [retryToken, setRetryToken] = useState(0);

  const fetchingMoreRef = useRef(false);
  /** Per-spot-id monotonic counter (B3): lets a save/unsave rejection tell
   * whether a newer call for the *same* spot already settled, so a stale
   * failure never reverts a state a later, successful call already set. */
  const saveTokensRef = useRef<Map<string, number>>(new Map());
  /** The scroll container the snap slots live in -- IntersectionObserver root. */
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  /** Absolute index -> mounted slot element, kept current by `registerSlot`
   * (below) as the +/-2 window mounts/unmounts them. */
  const slotElementsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  /** Non-null while a programmatic move (arrow keys, Hoy tap, deep link) is
   * still animating toward this index -- the IntersectionObserver fires for
   * every slot a smooth scroll passes over on the way there, and only the
   * destination itself may adopt activeIndex while this is armed. Cleared
   * three ways: the observer confirms arrival at the target; a genuine user
   * gesture (wheel, touch, pointerdown -- see the observer effect below)
   * shows the user has taken over, so their own scroll outranks the
   * in-flight programmatic one from that point on; or, failing both,
   * PROGRAMMATIC_SCROLL_SETTLE_MS as a last-resort safety net. Clearing this
   * alone is sufficient to fix a stuck guard -- once null, the very next
   * crossing (any index) is accepted -- unlike a mismatched crossing that
   * arrives *while still armed*, which is silently dropped and, since a
   * real IntersectionObserver only fires on threshold crossings, may never
   * be offered again once that slot settles above the threshold. That is
   * why cancelling promptly on user input matters more than the timeout. */
  const programmaticTargetRef = useRef<number | null>(null);

  /**
   * Single stable identity across every render (`useCallback` with no
   * dependencies) so React never detaches and reattaches a slot's ref just
   * because some unrelated piece of state changed elsewhere in the
   * component -- previously `getSlotRef(index)` returned a brand-new
   * closure on every render, thrashing every mounted slot's ref on every
   * re-render (paseo-motion.md Finding 4).
   *
   * Reads the index it needs off the element's own `data-index` attribute
   * -- which React has already applied to the DOM node by the time it
   * invokes a ref callback -- rather than closing over `index` or reading a
   * Map during render (the latter is what tripped `react-hooks/refs`,
   * "Cannot access refs during render", in an earlier attempt). Returns a
   * cleanup (React 19 ref-callback cleanup) that removes the same entry on
   * unmount, so bookkeeping only ever happens when React actually invokes
   * this as a ref, never synchronously during the JSX `.map()`.
   */
  const registerSlot = useCallback((element: HTMLDivElement | null) => {
    if (!element) return;
    const indexAttr = element.dataset.index;
    if (indexAttr === undefined) return;
    const index = Number(indexAttr);
    slotElementsRef.current.set(index, element);
    return () => {
      slotElementsRef.current.delete(index);
    };
  }, []);

  /** Moves `activeIndex` for one of the deck's own programmatic drivers
   * (arrow keys, Hoy tap, the ?spot= deep link) -- as opposed to the
   * IntersectionObserver adopting a user scroll. See `ActiveMove`. */
  function moveActiveIndexTo(next: number | ((current: number) => number)) {
    setActiveMove((current) => {
      const index = typeof next === "function" ? next(current.index) : next;
      // Bail out (same object, React skips the render) when the computed
      // destination is where the deck already is -- e.g. the first page
      // loading with no ?spot= match just confirms index 0, which is
      // already the initial value. That must not arm the mid-flight guard
      // against a "move" that never actually moves anything, which would
      // otherwise block the very first real observed scroll after load.
      if (index === current.index) return current;
      return { index, origin: "programmatic" };
    });
  }

  const showSignInGate = lane === "siguiendo" && auth.status === "signed-out";

  /**
   * `?spot=<id>` deep link: the first time the requested spot shows up
   * among a freshly-loaded page, returns its index so the caller can jump
   * to it; every call after that (or when there's no deep link, or it
   * isn't in `candidates`) returns `null`. Called from inside the fetch
   * effects' own async bodies (after their `await`), never synchronously
   * from an effect body itself.
   */
  const consumeDeepLink = useCallback(
    (candidates: SpotCard[]): number | null => {
      if (!deepLinkSpotId || deepLinkConsumedRef.current) return null;
      const index = candidates.findIndex((card) => card.id === deepLinkSpotId);
      if (index === -1) return null;
      deepLinkConsumedRef.current = true;
      return index;
    },
    [deepLinkSpotId],
  );

  // Load the active lane's first page whenever the lane, sign-in state, or
  // (for Cerca) the resolved coordinates change -- or Retry is pressed
  // after a failed load (retryToken).
  useEffect(() => {
    let cancelled = false;
    fetchingMoreRef.current = false;

    async function loadFirstPage() {
      if (lane === "siguiendo" && auth.status === "signed-out") {
        setCards([]);
        setIsPreview(false);
        moveActiveIndexTo(0);
        setHasMore(false);
        setLoading(false);
        setLoadError(false);
        return;
      }

      setLoading(true);
      setLoadError(false);
      setIsPreview(false);
      try {
        let result: SpotCard[];
        if (lane === "cerca") {
          result = await feedCerca(location.coords.lat, location.coords.lng, PAGE_SIZE, 0);
        } else if (lane === "nuevo") {
          result = await feedNuevo(PAGE_SIZE);
        } else {
          result = await feedSiguiendo(PAGE_SIZE);
        }
        if (cancelled) return;
        if (result.length === 0 && lane !== "siguiendo") {
          // Preview fallback: a public lane with nothing in it yet shows the
          // famous-places preview (src/lib/preview-spots.ts) so a first
          // visit still has something to swipe. Siguiendo stays empty on
          // purpose (you follow nobody), and a failed load stays an error.
          setCards(previewCards({ lat: location.coords.lat, lng: location.coords.lng }));
          setIsPreview(true);
          moveActiveIndexTo(0);
          setHasMore(false);
          return;
        }
        setCards(result);
        moveActiveIndexTo(consumeDeepLink(result) ?? 0);
        setHasMore(result.length >= PAGE_SIZE);
      } catch {
        if (cancelled) return;
        setCards([]);
        setHasMore(false);
        setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadFirstPage();

    return () => {
      cancelled = true;
    };
  }, [lane, auth.status, location.coords.lat, location.coords.lng, consumeDeepLink, retryToken]);

  // Hoy row + this account's saved/confirmed ids -- independent of lane,
  // refreshed whenever sign-in state changes.
  useEffect(() => {
    let cancelled = false;

    async function loadAccountContext() {
      const [hoy, saved, confirmed] = await Promise.all([
        hoyRow(),
        mySavedIds(),
        fetchMyConfirmedSpotIds(),
      ]);
      if (cancelled) return;
      setHoyEntries(hoy);
      setSavedIds(saved);
      setConfirmedIds(confirmed);
    }

    loadAccountContext();

    return () => {
      cancelled = true;
    };
  }, [auth.status]);

  // Notifies the desktop two-column layout (app/page.tsx) which card is
  // active, so its right-column map can pan to it.
  useEffect(() => {
    onActiveCardChange?.(cards[activeIndex] ?? null);
  }, [cards, activeIndex, onActiveCardChange]);

  // Prefetch the next page once the active card is within
  // PREFETCH_THRESHOLD of the end of what's loaded.
  useEffect(() => {
    if (loading || !hasMore || cards.length === 0 || fetchingMoreRef.current) return;
    if (cards.length - activeIndex > PREFETCH_THRESHOLD) return;

    fetchingMoreRef.current = true;

    async function loadNextPage() {
      let next: SpotCard[];
      if (lane === "cerca") {
        next = await feedCerca(location.coords.lat, location.coords.lng, PAGE_SIZE, cards.length);
      } else {
        const last = cards[cards.length - 1];
        const cursor: FeedCursor = { createdAt: last.createdAt, id: last.id };
        next = lane === "nuevo" ? await feedNuevo(PAGE_SIZE, cursor) : await feedSiguiendo(PAGE_SIZE, cursor);
      }

      if (next.length === 0) {
        setHasMore(false);
      } else {
        // De-dupe by id (B2): offset-based paging can overlap when a spot
        // is created between two fetches, shifting every later row by one
        // and returning a spot id the deck already has loaded.
        const existingIds = new Set(cards.map((card) => card.id));
        const deduped = next.filter((card) => !existingIds.has(card.id));
        const merged = [...cards, ...deduped];
        setCards(merged);
        const deepLinkIndex = consumeDeepLink(merged);
        if (deepLinkIndex != null) moveActiveIndexTo(deepLinkIndex);
      }
      fetchingMoreRef.current = false;
    }

    loadNextPage();
  }, [activeIndex, cards, hasMore, lane, loading, consumeDeepLink, location.coords.lat, location.coords.lng]);

  const windowStart = Math.max(0, activeIndex - WINDOW_RADIUS);
  const windowEnd = Math.min(cards.length, activeIndex + WINDOW_RADIUS + 1);
  const windowedCards = cards.slice(windowStart, windowEnd).map((card, offset) => ({
    card,
    index: windowStart + offset,
  }));

  // Scrolls the active slot into view -- but only for a programmatic move
  // (arrow keys, a Hoy tap, the ?spot= deep link). An observed move means
  // the IntersectionObserver below is only reporting where the user's own
  // touch scroll already put the viewport; calling scrollIntoView there
  // would fire a JS smooth-scroll against a finger still dragging and
  // against the CSS snap-mandatory that already settled it (Finding 3).
  //
  // Also arms `programmaticTargetRef` for the duration of the move: a
  // programmatic scrollIntoView animates past every slot between the old
  // and new positions, and the observer below fires for each one it
  // passes over. None of those intermediate crossings may hijack
  // activeIndex away from this destination -- only the observer entry that
  // matches `activeMove.index` itself is allowed to clear the guard. The
  // settle timer is a safety net for when the observer never confirms
  // arrival at all (no real scrollIntoView support, e.g. jsdom/SSR).
  useEffect(() => {
    if (activeMove.origin !== "programmatic") return;

    programmaticTargetRef.current = activeMove.index;

    const element = slotElementsRef.current.get(activeMove.index);
    if (element && typeof element.scrollIntoView === "function") {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    const settleTimer = setTimeout(() => {
      programmaticTargetRef.current = null;
    }, PROGRAMMATIC_SCROLL_SETTLE_MS);

    return () => clearTimeout(settleTimer);
  }, [activeMove]);

  // Scroll-driven active index (paseo-motion.md prerequisite fix): a finger
  // swipe never updated activeIndex at all -- it only moved on arrow keys, a
  // Hoy tap, or the ?spot= deep link -- desyncing the desktop map
  // (onActiveCardChange) and the +/-2 render window from what's actually on
  // screen. Observes every currently mounted slot against the scroller
  // itself and adopts whichever one crosses ACTIVE_VISIBILITY_THRESHOLD.
  //
  // Disconnects and re-creates on every +/-2 window shift, which in
  // practice is almost every activeIndex move -- real churn, not just a
  // one-off on mount. Left this way deliberately rather than incrementally
  // observing/unobserving only the slots that entered or left: it isn't a
  // correctness bug (a real IntersectionObserver replays each observed
  // element's current intersection state immediately on `observe()`, so
  // nothing is missed by the rebuild), and an incremental version would
  // have to track its own "already observed" set in a ref and coordinate
  // it with the `programmaticTargetRef` guard above for no measured
  // performance win -- not worth the added surface for a Medium/no-bug
  // finding.
  useEffect(() => {
    const root = scrollerRef.current;
    if (!root || typeof IntersectionObserver !== "function") return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || entry.intersectionRatio < ACTIVE_VISIBILITY_THRESHOLD) continue;
          const indexAttr = (entry.target as HTMLElement).dataset.index;
          if (indexAttr === undefined) continue;
          const index = Number(indexAttr);

          // A programmatic move is still animating toward
          // programmaticTargetRef.current -- ignore every crossing except
          // the destination itself, and release the guard once it's seen.
          if (programmaticTargetRef.current !== null) {
            if (programmaticTargetRef.current !== index) continue;
            programmaticTargetRef.current = null;
          }

          setActiveMove((current) =>
            current.index === index ? current : { index, origin: "observed" },
          );
        }
      },
      { root, threshold: ACTIVE_VISIBILITY_THRESHOLD },
    );

    slotElementsRef.current.forEach((element) => observer.observe(element));

    // Reconciliation for an overtaken programmatic move (paseo-motion.md
    // Finding 4.2): a real user gesture -- wheel, touch, or a pointer down
    // on the track -- can interrupt an in-flight scrollIntoView and settle
    // on a slot that is never the guarded destination. `scrollIntoView`
    // itself never dispatches any of these three, so seeing one here is an
    // unambiguous signal the user has taken over; their gesture always
    // outranks an in-flight programmatic scroll from that point on. This
    // cancels the guard immediately (rather than waiting on the crossing
    // that will now never arrive at the original target, or on the
    // PROGRAMMATIC_SCROLL_SETTLE_MS timeout above), so the very next
    // crossing -- whatever slot the user actually lands on -- is accepted
    // as an ordinary observed move. It does not call scrollIntoView itself
    // and does not touch activeMove directly, so an uninterrupted
    // programmatic move (no such gesture fires) still ignores every
    // intermediate crossing exactly as before.
    function cancelGuardOnUserInput() {
      programmaticTargetRef.current = null;
    }
    root.addEventListener("wheel", cancelGuardOnUserInput, { passive: true });
    root.addEventListener("touchstart", cancelGuardOnUserInput, { passive: true });
    root.addEventListener("pointerdown", cancelGuardOnUserInput);

    return () => {
      observer.disconnect();
      root.removeEventListener("wheel", cancelGuardOnUserInput);
      root.removeEventListener("touchstart", cancelGuardOnUserInput);
      root.removeEventListener("pointerdown", cancelGuardOnUserInput);
    };
  }, [windowStart, windowEnd]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActiveIndexTo((index) => Math.min(index + 1, Math.max(cards.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActiveIndexTo((index) => Math.max(index - 1, 0));
    }
  }

  function handleHoySelect(spotId: string) {
    const index = cards.findIndex((card) => card.id === spotId);
    if (index !== -1) moveActiveIndexTo(index);
  }

  /** Bumps and returns this spot's save/unsave sequence token (B3). */
  function nextSaveToken(spotId: string): number {
    const next = (saveTokensRef.current.get(spotId) ?? 0) + 1;
    saveTokensRef.current.set(spotId, next);
    return next;
  }

  async function handleSave(spotId: string) {
    if (isPreviewSpot(spotId)) return;
    const token = nextSaveToken(spotId);
    setSavedIds((prev) => new Set(prev).add(spotId));
    try {
      await saveSpot(spotId);
    } catch {
      // Only revert if no newer save/unsave call for this same spot has
      // started since -- a stale rejection must not clobber a later,
      // successful (duplicate double-tap) call's outcome.
      if (saveTokensRef.current.get(spotId) !== token) return;
      setSavedIds((prev) => {
        const next = new Set(prev);
        next.delete(spotId);
        return next;
      });
    }
  }

  async function handleUnsave(spotId: string) {
    if (isPreviewSpot(spotId)) return;
    const token = nextSaveToken(spotId);
    setSavedIds((prev) => {
      const next = new Set(prev);
      next.delete(spotId);
      return next;
    });
    try {
      await unsaveSpot(spotId);
    } catch {
      if (saveTokensRef.current.get(spotId) !== token) return;
      setSavedIds((prev) => new Set(prev).add(spotId));
    }
  }

  async function handleBeenHere(spotId: string) {
    if (isPreviewSpot(spotId)) return;
    try {
      const updated = await confirmSpot(spotId);
      setConfirmedIds((prev) => new Set(prev).add(spotId));
      setCards((prev) =>
        prev.map((card) =>
          card.id === spotId
            ? { ...card, status: updated.status, confirmations: updated.confirmations }
            : card,
        ),
      );
    } catch {
      // Best-effort, mirrors ConfirmButton/SpotMap: no error UI beyond the
      // control simply staying available to try again.
    }
  }

  async function handleReport(spotId: string, reason: ReportReason, details?: string) {
    if (isPreviewSpot(spotId)) return;
    try {
      await reportSpot(spotId, reason, details);
    } catch {
      // Reporting is a best-effort signal (product.md) -- no error UI.
    }
  }

  const activeCard = cards[activeIndex];

  return (
    <div
      data-testid="spots-deck"
      data-active-id={activeCard?.id ?? ""}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="relative flex h-full w-full flex-col outline-none"
    >
      <div className="flex items-center gap-2 border-b border-stone bg-cream-deep px-4 py-2">
        {LANES.map((laneKey) => (
          <button
            key={laneKey}
            type="button"
            onClick={() => setLane(laneKey)}
            aria-label={bilingualLabel(laneCopyKey(laneKey))}
            aria-pressed={lane === laneKey}
            className={`${TAB_BASE_CLASS} ${lane === laneKey ? TAB_ACTIVE_CLASS : TAB_INACTIVE_CLASS}`}
          >
            <Bilingual k={laneCopyKey(laneKey)} tone="inherit" layout="stack" />
          </button>
        ))}
      </div>

      {lane === "cerca" && location.isFallback && (
        <p className="px-4 py-1 text-xs text-stone-deep">
          <Bilingual k="usingCenter" />
        </p>
      )}

      {isPreview && !loading && (
        <p className="border-b border-stone bg-cream-deep px-4 py-1 text-xs text-stone-deep">
          <Bilingual k="previewHint" />
        </p>
      )}

      {lane !== "nuevo" && !showSignInGate && <HoyRow entries={hoyEntries} onSelect={handleHoySelect} />}

      <div className="relative min-h-0 flex-1">
        {showSignInGate ? (
          // Not the shared `SignInPrompt` overlay -- that component's own
          // heading and Bilingual copy both restate "sign in", which reads
          // fine as a modal but is one message too many for an inline
          // lane gate (see aria-names.adversarial.test.tsx's precise
          // queries versus this frozen suite's broad /sign in/i match).
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-sm text-ink">Follow people to see their spots here.</p>
            <Link
              href="/login?next=/"
              className="inline-flex min-h-10 items-center justify-center rounded bg-terracotta px-4 py-2 text-sm font-bold text-cream hover:bg-terracotta-deep"
            >
              Sign in
            </Link>
          </div>
        ) : loading && cards.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-stone-deep">
            <Bilingual k="loading" />
          </div>
        ) : loadError ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <StoneArch width={140} height={14} />
            <p className="text-sm font-medium text-stone-deep">
              <Bilingual k="couldNotLoad" />
            </p>
            <button
              type="button"
              onClick={() => setRetryToken((token) => token + 1)}
              aria-label="Retry"
              className="min-h-10 rounded bg-terracotta px-4 py-2 text-sm font-bold text-cream hover:bg-terracotta-deep"
            >
              Retry
            </button>
          </div>
        ) : cards.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <StoneArch width={140} height={14} />
            <p className="text-sm font-medium text-stone-deep">
              <Bilingual k="noSpotsYet" />
            </p>
          </div>
        ) : (
          <div
            ref={scrollerRef}
            className="flex h-full flex-col snap-y snap-mandatory overflow-y-auto scroll-smooth"
          >
            {windowedCards.map(({ card, index }) => (
              <div
                key={card.id}
                ref={registerSlot}
                data-index={index}
                data-active={String(index === activeIndex)}
                className="paseo-slot h-full w-full shrink-0 snap-start"
              >
                <SpotCardView
                  card={card}
                  isSaved={savedIds.has(card.id)}
                  confirmedByMe={confirmedIds.has(card.id)}
                  onSave={() => handleSave(card.id)}
                  onUnsave={() => handleUnsave(card.id)}
                  onBeenHere={() => handleBeenHere(card.id)}
                  onReport={(reason, details) => handleReport(card.id, reason, details)}
                  isOnMyMap={
                    savedIds.has(card.id) || confirmedIds.has(card.id) || card.author.id === auth.user?.id
                  }
                  authStatus={auth.status}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
