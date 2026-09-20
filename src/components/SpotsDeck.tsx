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

const LANES: readonly Lane[] = ["cerca", "nuevo", "siguiendo"];
const PAGE_SIZE = 10;
/** Prefetch the next page once the active card is this close to the end. */
const PREFETCH_THRESHOLD = 3;
/** At most this many cards on either side of the active one stay mounted. */
const WINDOW_RADIUS = 2;

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
  const [activeIndex, setActiveIndex] = useState(0);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set());
  const [hoyEntries, setHoyEntries] = useState<HoyEntry[]>([]);
  const [retryToken, setRetryToken] = useState(0);

  const fetchingMoreRef = useRef(false);
  /** Per-spot-id monotonic counter (B3): lets a save/unsave rejection tell
   * whether a newer call for the *same* spot already settled, so a stale
   * failure never reverts a state a later, successful call already set. */
  const saveTokensRef = useRef<Map<string, number>>(new Map());

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
        setActiveIndex(0);
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
          setActiveIndex(0);
          setHasMore(false);
          return;
        }
        setCards(result);
        setActiveIndex(consumeDeepLink(result) ?? 0);
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
        if (deepLinkIndex != null) setActiveIndex(deepLinkIndex);
      }
      fetchingMoreRef.current = false;
    }

    loadNextPage();
  }, [activeIndex, cards, hasMore, lane, loading, consumeDeepLink, location.coords.lat, location.coords.lng]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, Math.max(cards.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    }
  }

  function handleHoySelect(spotId: string) {
    const index = cards.findIndex((card) => card.id === spotId);
    if (index !== -1) setActiveIndex(index);
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
  const windowStart = Math.max(0, activeIndex - WINDOW_RADIUS);
  const windowEnd = Math.min(cards.length, activeIndex + WINDOW_RADIUS + 1);
  const windowedCards = cards.slice(windowStart, windowEnd).map((card, offset) => ({
    card,
    index: windowStart + offset,
  }));

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
          <div className="flex h-full flex-col snap-y snap-mandatory overflow-y-auto scroll-smooth">
            {windowedCards.map(({ card }) => (
              <div key={card.id} className="h-full w-full shrink-0 snap-start">
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
