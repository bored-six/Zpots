import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthStatus, AuthUser } from "@/lib/auth";

/**
 * Adversarial pass on PostFlow's submit guard: does a genuine "submit while
 * already submitting" double-fire still only call createSpot once? (Mirrors
 * PostFlow.test.tsx's mock harness.)
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

vi.mock("react-leaflet", async () => {
  const React = await import("react");
  return {
    MapContainer: React.forwardRef(function MockMapContainer(
      { children }: { children?: React.ReactNode },
    ) {
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

async function advanceToStepTwo() {
  const user = userEvent.setup();
  const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
  await user.upload(fileInput, makeImageFile());
  return user;
}

describe("adversarial: PostFlow submit-while-submitting", () => {
  it("the submit button is disabled while a submission is in flight, so a second click cannot fire", async () => {
    let resolveCreate!: (spot: unknown) => void;
    createSpot.mockReturnValue(new Promise((resolve) => (resolveCreate = resolve)));
    const user = userEvent.setup();
    await renderPostFlow();
    await advanceToStepTwo();
    await user.type(screen.getByLabelText((c) => c.trim().toLowerCase() === "name"), "New Spot");
    await user.type(screen.getByLabelText((c) => c.trim().toLowerCase() === "note"), "A short note.");

    const submitButton = document.querySelector('button[type="submit"]') as HTMLButtonElement;
    await user.click(submitButton);

    expect(submitButton).toBeDisabled();

    resolveCreate({
      id: "spot-new",
      name: "New Spot",
      note: "A short note.",
      lat: INSIDE_CITY.lat,
      lng: INSIDE_CITY.lng,
      status: "unconfirmed",
      confirmations: 0,
      createdAt: "2026-02-01T00:00:00.000Z",
    });
    await waitFor(() => expect(createSpot).toHaveBeenCalledTimes(1));
  });

  it("two form-submit events fired back-to-back in the same tick (no await between them, simulating a genuine double-tap before React can re-render) call createSpot only once", async () => {
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
    const user = userEvent.setup();
    await renderPostFlow();
    await advanceToStepTwo();
    await user.type(screen.getByLabelText((c) => c.trim().toLowerCase() === "name"), "New Spot");
    await user.type(screen.getByLabelText((c) => c.trim().toLowerCase() === "note"), "A short note.");

    const form = (document.querySelector('button[type="submit"]') as HTMLButtonElement).closest("form")!;

    fireEvent.submit(form);
    fireEvent.submit(form);

    await waitFor(() => expect(createSpot).toHaveBeenCalledTimes(1));
  });
});
