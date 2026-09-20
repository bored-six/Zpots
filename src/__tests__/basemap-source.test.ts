import { describe, expect, it, vi } from "vitest";
import { probeBasemapArchive, type BasemapFetchLike } from "@/lib/basemap-source";

const PMTILES_URL = "https://cdn.example.com/basemap/zamboanga.pmtiles";

/** Bytes 0-7 of a real PMTiles v3 archive: "PMTiles" + spec version 3. */
const GOOD_MAGIC = new Uint8Array([0x50, 0x4d, 0x54, 0x69, 0x6c, 0x65, 0x73, 0x03]);

/** Same length, wrong content -- what an unrelated file would start with. */
const BAD_MAGIC = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]);

function htmlErrorPageBytes(): Uint8Array {
  return new TextEncoder().encode("<!DOCTYPE html><html><body>Not Found</body></html>");
}

function fakeResponse(status: number, bytes: Uint8Array) {
  return {
    status,
    arrayBuffer: () => Promise.resolve(bytes.buffer as ArrayBuffer),
  };
}

function fetchImplReturning(status: number, bytes: Uint8Array): BasemapFetchLike {
  return vi.fn().mockResolvedValue(fakeResponse(status, bytes));
}

describe("probeBasemapArchive", () => {
  it("206 with body starting 'PMTiles\\x03' resolves 'ok'", async () => {
    const fetchImpl = fetchImplReturning(206, GOOD_MAGIC);

    await expect(probeBasemapArchive(PMTILES_URL, fetchImpl)).resolves.toBe("ok");
  });

  it("sends exactly one request, with header Range: bytes=0-16383, and never reads more", async () => {
    const fetchImpl = fetchImplReturning(206, GOOD_MAGIC);

    await probeBasemapArchive(PMTILES_URL, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      PMTILES_URL,
      expect.objectContaining({
        headers: expect.objectContaining({ Range: "bytes=0-16383" }),
      }),
    );
  });

  it("plain 200 with valid magic resolves 'unavailable' -- ignoring Range is a failure", async () => {
    const fetchImpl = fetchImplReturning(200, GOOD_MAGIC);

    await expect(probeBasemapArchive(PMTILES_URL, fetchImpl)).resolves.toBe("unavailable");
  });

  it("404 resolves 'unavailable'", async () => {
    const fetchImpl = fetchImplReturning(404, GOOD_MAGIC);

    await expect(probeBasemapArchive(PMTILES_URL, fetchImpl)).resolves.toBe("unavailable");
  });

  it("403 resolves 'unavailable'", async () => {
    const fetchImpl = fetchImplReturning(403, GOOD_MAGIC);

    await expect(probeBasemapArchive(PMTILES_URL, fetchImpl)).resolves.toBe("unavailable");
  });

  it("500 resolves 'unavailable'", async () => {
    const fetchImpl = fetchImplReturning(500, GOOD_MAGIC);

    await expect(probeBasemapArchive(PMTILES_URL, fetchImpl)).resolves.toBe("unavailable");
  });

  it("206 with wrong magic bytes resolves 'unavailable'", async () => {
    const fetchImpl = fetchImplReturning(206, BAD_MAGIC);

    await expect(probeBasemapArchive(PMTILES_URL, fetchImpl)).resolves.toBe("unavailable");
  });

  it("206 with an HTML error page body resolves 'unavailable'", async () => {
    const fetchImpl = fetchImplReturning(206, htmlErrorPageBytes());

    await expect(probeBasemapArchive(PMTILES_URL, fetchImpl)).resolves.toBe("unavailable");
  });

  it("206 with a body shorter than 8 bytes resolves 'unavailable'", async () => {
    const fetchImpl = fetchImplReturning(206, GOOD_MAGIC.slice(0, 3));

    await expect(probeBasemapArchive(PMTILES_URL, fetchImpl)).resolves.toBe("unavailable");
  });

  it("fetch rejecting (network down / CORS) resolves 'unavailable' and does not throw", async () => {
    const fetchImpl: BasemapFetchLike = vi.fn().mockRejectedValue(new Error("network down"));

    await expect(probeBasemapArchive(PMTILES_URL, fetchImpl)).resolves.toBe("unavailable");
  });

  it("a URL whose pathname does not end in .pmtiles resolves 'unavailable' without any fetch", async () => {
    const fetchImpl: BasemapFetchLike = vi.fn();

    // The exact trap from view.ts:244 -- a query string suffix does not count as the path.
    await expect(
      probeBasemapArchive("https://cdn.example.com/zamboanga?download=zamboanga.pmtiles", fetchImpl),
    ).resolves.toBe("unavailable");

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("a request that never settles resolves 'unavailable' after the 8s timeout, aborted", async () => {
    vi.useFakeTimers();
    try {
      let capturedSignal: AbortSignal | undefined;
      const fetchImpl: BasemapFetchLike = vi.fn((_url, init) => {
        capturedSignal = init?.signal ?? undefined;
        return new Promise(() => {
          // never resolves or rejects on its own
        });
      });

      const resultPromise = probeBasemapArchive(PMTILES_URL, fetchImpl);

      await vi.advanceTimersByTimeAsync(8000);
      const result = await resultPromise;

      expect(result).toBe("unavailable");
      expect(capturedSignal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
