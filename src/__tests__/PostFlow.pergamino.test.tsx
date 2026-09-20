import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AuthStatus, AuthUser } from "@/lib/auth";

/**
 * Pergamino PRD, T3.2 -- PostFlow's tap-to-pick-a-spot map (the GPS
 * fallback). Same swap as MapInsetInner: `BasemapLayer` replaces the raw
 * `TileLayer`, and per D6/E17 there is no fallback chip and no
 * `PlaceLabelsLayer` here either -- "the tap map's job is picking a
 * coordinate, not being pretty." Mirrors PostFlow.test.tsx's mock harness.
 */

const createSpot = vi.fn();
const useAuthMock = vi.fn();
const useLocationMock = vi.fn();
const routerPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
}));

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/lib/use-location", () => ({
  useLocation: () => useLocationMock(),
}));

vi.mock("@/lib/spots-repo", () => ({
  createSpot: (...args: unknown[]) => createSpot(...args),
}));

const { fakeMap } = vi.hoisted(() => ({
  fakeMap: { on: vi.fn(), off: vi.fn() },
}));

vi.mock("react-leaflet", async () => {
  const React = await import("react");
  return {
    MapContainer: React.forwardRef(function MockMapContainer(
      { children }: { children?: React.ReactNode },
      ref: React.Ref<unknown>,
    ) {
      React.useImperativeHandle(ref, () => fakeMap);
      return <div data-testid="post-flow-map">{children}</div>;
    }),
    TileLayer: () => <div data-testid="tile-layer" />,
    Marker: () => <div data-testid="marker" />,
  };
});

vi.mock("@/components/CityMask", () => ({
  default: () => <div data-testid="city-mask" />,
}));

vi.mock("@/components/BasemapLayer", () => ({
  default: (props: { map: unknown; onModeChange?: unknown }) => (
    <div
      data-testid="basemap"
      data-has-map={props.map ? "yes" : "no"}
      data-has-mode-change={props.onModeChange ? "yes" : "no"}
    />
  ),
}));

function authValue(status: AuthStatus, user: AuthUser | null = null) {
  return { status, user, signOut: vi.fn() };
}

function makeImageFile(name = "photo.jpg"): File {
  return new File([new Uint8Array(1024)], name, { type: "image/jpeg" });
}

const INSIDE_CITY = { lat: 6.9106, lng: 122.0736 };

beforeEach(() => {
  vi.clearAllMocks();
  useAuthMock.mockReturnValue(authValue("signed-in", { id: "user-1", email: "a@b.com", nickname: "" }));
  // Denied GPS forces the fallback tap map to render (same trigger as
  // PostFlow.test.tsx's "GPS denied" describe block).
  useLocationMock.mockReturnValue({ status: "denied", coords: INSIDE_CITY, isFallback: true });
});

async function renderPostFlow() {
  const PostFlow = (await import("@/components/PostFlow")).default;
  return render(<PostFlow />);
}

async function advanceToStepTwo() {
  const user = userEvent.setup();
  const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
  await user.upload(fileInput, makeImageFile());
  return user;
}

describe("PostFlow -- Pergamino wiring (T3.2)", () => {
  it("renders exactly one BasemapLayer and no raster TileLayer in the fallback tap map", async () => {
    await renderPostFlow();
    await advanceToStepTwo();

    expect(await screen.findByTestId("post-flow-map")).toBeInTheDocument();
    expect(await screen.findAllByTestId("basemap")).toHaveLength(1);
    expect(screen.queryByTestId("tile-layer")).not.toBeInTheDocument();
  });

  it("passes the live map instance to BasemapLayer", async () => {
    await renderPostFlow();
    await advanceToStepTwo();

    const basemap = await screen.findByTestId("basemap");
    expect(basemap).toHaveAttribute("data-has-map", "yes");
  });

  it("does not import or render PlaceLabelsLayer -- the tap map is ground + pin only", () => {
    const source = readFileSync(join(process.cwd(), "src/components/PostFlow.tsx"), "utf8");
    expect(source).not.toMatch(/from ["']@\/components\/PlaceLabelsLayer["']/);
    expect(source).not.toMatch(/<PlaceLabelsLayer\b/);
  });
});
