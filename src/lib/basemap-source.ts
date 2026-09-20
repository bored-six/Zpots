/**
 * Probes a `.pmtiles` archive before protomaps-leaflet ever touches it.
 *
 * protomaps-leaflet swallows tile errors with a bare `console.error` and
 * emits no Leaflet event (`src/frontends/leaflet.ts:150`), so failure has
 * to be detected here, up front, not discovered mid-render.
 *
 * Success means: the server answered the ranged request with `206` *and*
 * the first bytes are the PMTiles v3 magic number. A plain `200` is a
 * failure even with a valid body -- a server that ignores `Range` would
 * pull the whole (multi-MB) archive onto a phone just to draw one tile.
 */

export type BasemapProbeResult = "ok" | "unavailable";

/**
 * Narrow shape of `fetch` this module actually needs, so tests can pass a
 * hand-written stand-in instead of a full `Response`. The global `fetch`
 * satisfies this type structurally.
 */
export type BasemapFetchLike = (
  input: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{ status: number; arrayBuffer(): Promise<ArrayBuffer> }>;

/** Only the archive's first 16 KiB are requested -- plenty for the PMTiles header. */
const RANGE_HEADER = "bytes=0-16383";

/** protomaps-leaflet's own trap (`view.ts:244`): it decides PMTiles by the URL's *path*. */
const PMTILES_PATH_SUFFIX = ".pmtiles";

/** How long to wait for the ranged request before giving up and falling back. */
const PROBE_TIMEOUT_MS = 8000;

/** "PMTiles" + spec version 3, per the PMTiles v3 spec's first 8 bytes. */
const PMTILES_MAGIC = new Uint8Array([0x50, 0x4d, 0x54, 0x69, 0x6c, 0x65, 0x73, 0x03]);

function hasPmtilesMagic(bytes: Uint8Array): boolean {
  if (bytes.length < PMTILES_MAGIC.length) {
    return false;
  }
  for (let i = 0; i < PMTILES_MAGIC.length; i++) {
    if (bytes[i] !== PMTILES_MAGIC[i]) {
      return false;
    }
  }
  return true;
}

function endsWithPmtilesPath(url: string): boolean {
  try {
    // A relative default (e.g. "/basemap/zamboanga.pmtiles") needs a base
    // to resolve against; any dummy origin works since only pathname is read.
    const pathname = new URL(url, "https://basemap.invalid").pathname;
    return pathname.endsWith(PMTILES_PATH_SUFFIX);
  } catch {
    return false;
  }
}

/**
 * Resolves "ok" only for a `206` response whose body starts with the
 * PMTiles magic bytes. Never throws -- every failure mode (bad status,
 * bad magic, short body, network rejection, timeout, non-`.pmtiles` path)
 * resolves "unavailable" instead.
 */
export async function probeBasemapArchive(
  url: string,
  fetchImpl: BasemapFetchLike = fetch,
): Promise<BasemapProbeResult> {
  if (!endsWithPmtilesPath(url)) {
    return "unavailable";
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const response = await Promise.race([
      fetchImpl(url, { headers: { Range: RANGE_HEADER }, signal: controller.signal }),
      new Promise<never>((_resolve, reject) => {
        controller.signal.addEventListener("abort", () => {
          reject(new Error("basemap probe timed out"));
        });
      }),
    ]);

    if (response.status !== 206) {
      return "unavailable";
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    return hasPmtilesMagic(bytes) ? "ok" : "unavailable";
  } catch {
    return "unavailable";
  } finally {
    clearTimeout(timeoutId);
  }
}
