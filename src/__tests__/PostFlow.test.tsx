import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthStatus, AuthUser } from "@/lib/auth";
import { COPY } from "@/lib/copy";

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

// Same hoisted fake-map pattern as SpotMap.wiring.test.tsx -- lets the
// outside-city fallback map be tapped without rendering real Leaflet.
const { fakeMap, emitMapClick } = vi.hoisted(() => {
  const handlers: Record<string, Array<(event: unknown) => void>> = {};
  const emitMapClick = (lat: number, lng: number) => {
    for (const handler of handlers["click"] ?? []) {
      handler({ latlng: { lat, lng } });
    }
  };
  const fakeMap = {
    on: (event: string, handler: (e: unknown) => void) => {
      (handlers[event] ??= []).push(handler);
    },
    off: (event: string, handler: (e: unknown) => void) => {
      handlers[event] = (handlers[event] ?? []).filter((h) => h !== handler);
    },
  };
  return { fakeMap, emitMapClick };
});

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

function authValue(status: AuthStatus, user: AuthUser | null = null) {
  return { status, user, signOut: vi.fn() };
}

function makeImageFile(name = "photo.jpg"): File {
  return new File([new Uint8Array(1024)], name, { type: "image/jpeg" });
}

const INSIDE_CITY = { lat: 6.9106, lng: 122.0736 };
const OUTSIDE_CITY = { lat: 14.5995, lng: 120.9842 }; // Manila -- outside Zamboanga City bounds

beforeEach(() => {
  vi.clearAllMocks();
  useAuthMock.mockReturnValue(authValue("signed-in", { id: "user-1", email: "a@b.com", nickname: "" }));
  useLocationMock.mockReturnValue({ status: "granted", coords: INSIDE_CITY, isFallback: false });
});

afterEach(() => {
  vi.resetAllMocks();
});

async function renderPostFlow() {
  const PostFlow = (await import("@/components/PostFlow")).default;
  return render(<PostFlow />);
}

describe("PostFlow -- signed out", () => {
  it("shows a sign-in gate instead of the camera step", async () => {
    useAuthMock.mockReturnValue(authValue("signed-out"));

    await renderPostFlow();

    expect(await screen.findByText(/sign in/i)).toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).not.toBeInTheDocument();
  });
});

describe("PostFlow -- camera step", () => {
  it("renders a file input with capture='environment' behind the 'Saca foto' control", async () => {
    await renderPostFlow();

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();
    expect(fileInput).toHaveAttribute("capture", "environment");
    expect(fileInput.accept).toMatch(/^image\//);
  });

  it("has a secondary 'Escoge foto' control (choosePhoto copy) as a distinct affordance", async () => {
    await renderPostFlow();

    expect(screen.getByText(new RegExp(COPY.choosePhoto.en, "i"))).toBeInTheDocument();
  });
});

async function advanceToStepTwo() {
  const user = userEvent.setup();
  const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
  await user.upload(fileInput, makeImageFile());
  return user;
}

describe("PostFlow -- location step, GPS granted inside the city", () => {
  it("does not show the fallback tap map", async () => {
    await renderPostFlow();
    await advanceToStepTwo();

    expect(screen.queryByTestId("post-flow-map")).not.toBeInTheDocument();
  });
});

describe("PostFlow -- location step, GPS denied", () => {
  it("shows the fallback tap map even though the fallback coords are inside the city", async () => {
    useLocationMock.mockReturnValue({ status: "denied", coords: INSIDE_CITY, isFallback: true });
    await renderPostFlow();
    await advanceToStepTwo();

    expect(await screen.findByTestId("post-flow-map")).toBeInTheDocument();
  });

  it("shows the 'using city center' note", async () => {
    useLocationMock.mockReturnValue({ status: "denied", coords: INSIDE_CITY, isFallback: true });
    await renderPostFlow();
    await advanceToStepTwo();

    expect(await screen.findByText(new RegExp(COPY.usingCenter.en, "i"))).toBeInTheDocument();
  });
});

describe("PostFlow -- location step, GPS granted but outside the city", () => {
  it("shows the fallback tap map and blocks submit until a valid in-city tap lands", async () => {
    useLocationMock.mockReturnValue({ status: "granted", coords: OUTSIDE_CITY, isFallback: false });
    const user = userEvent.setup();
    await renderPostFlow();
    await advanceToStepTwo();

    await screen.findByTestId("post-flow-map");
    await user.type(screen.getByLabelText((c) => c.trim().toLowerCase() === "name"), "New Spot");
    await user.type(screen.getByLabelText((c) => c.trim().toLowerCase() === "note"), "A short note.");

    const submitButton = document.querySelector('button[type="submit"]') as HTMLButtonElement;
    await user.click(submitButton);
    expect(createSpot).not.toHaveBeenCalled();

    act(() => {
      emitMapClick(INSIDE_CITY.lat, INSIDE_CITY.lng);
    });
    await user.click(submitButton);

    await waitFor(() => expect(createSpot).toHaveBeenCalledTimes(1));
  });
});

describe("PostFlow -- submit", () => {
  it("calls createSpot exactly once with the resolved lat/lng, then routes home", async () => {
    const user = userEvent.setup();
    createSpot.mockResolvedValue({
      id: "spot-new",
      name: "New Spot",
      note: "A short note.",
      lat: INSIDE_CITY.lat,
      lng: INSIDE_CITY.lng,
      status: "unconfirmed",
      confirmations: 0,
      createdAt: "2026-02-01T00:00:00.000Z",
    });
    await renderPostFlow();
    await advanceToStepTwo();

    await user.type(screen.getByLabelText((c) => c.trim().toLowerCase() === "name"), "New Spot");
    await user.type(screen.getByLabelText((c) => c.trim().toLowerCase() === "note"), "A short note.");

    const submitButton = document.querySelector('button[type="submit"]') as HTMLButtonElement;
    await user.click(submitButton);

    await waitFor(() => expect(createSpot).toHaveBeenCalledTimes(1));
    expect(createSpot.mock.calls[0][0]).toMatchObject({
      name: "New Spot",
      lat: INSIDE_CITY.lat,
      lng: INSIDE_CITY.lng,
    });
    await waitFor(() => expect(routerPush).toHaveBeenCalled());
    expect(routerPush.mock.calls[0][0]).toMatch(/^\//);
  });

  it("shows the spotIsUp toast copy on success", async () => {
    const user = userEvent.setup();
    createSpot.mockResolvedValue({
      id: "spot-new",
      name: "New Spot",
      note: "A short note.",
      lat: INSIDE_CITY.lat,
      lng: INSIDE_CITY.lng,
      status: "unconfirmed",
      confirmations: 0,
      createdAt: "2026-02-01T00:00:00.000Z",
    });
    await renderPostFlow();
    await advanceToStepTwo();
    await user.type(screen.getByLabelText((c) => c.trim().toLowerCase() === "name"), "New Spot");
    await user.type(screen.getByLabelText((c) => c.trim().toLowerCase() === "note"), "A short note.");
    await user.click(document.querySelector('button[type="submit"]') as HTMLButtonElement);

    expect(await screen.findByText(new RegExp(COPY.spotIsUp.en, "i"))).toBeInTheDocument();
  });
});
