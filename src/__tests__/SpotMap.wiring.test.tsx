import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Spot } from "@/lib/spots";

/**
 * Own, richer stand-in for react-leaflet than SpotMap.test.tsx uses --
 * that file's mock is frozen and only covers static rendering. This one
 * additionally forwards a fake Leaflet Map instance through `ref` (the same
 * way react-leaflet's real `MapContainer` does: `React.ForwardRefExoticComponent
 * <MapContainerProps & React.RefAttributes<LeafletMap>>`), with an `on`/`off`/
 * `emit` event bus, so we can simulate a real map tap without rendering
 * actual Leaflet in jsdom.
 */
const { fakeMap, emitMapClick } = vi.hoisted(() => {
  const handlers: Record<string, Array<(event: unknown) => void>> = {};
  const map = {
    on: (event: string, handler: (e: unknown) => void) => {
      (handlers[event] ??= []).push(handler);
    },
    off: (event: string, handler: (e: unknown) => void) => {
      handlers[event] = (handlers[event] ?? []).filter((h) => h !== handler);
    },
    // SpotMap now also calls this imperatively (belt-and-suspenders on top
    // of the `maxBounds` JSX prop) once the map instance is available.
    setMaxBounds: () => {},
  };
  const emitMapClick = (lat: number, lng: number) => {
    for (const handler of handlers["click"] ?? []) {
      handler({ latlng: { lat, lng } });
    }
  };
  return { fakeMap: map, emitMapClick };
});

vi.mock("react-leaflet", async () => {
  const React = await import("react");
  return {
    MapContainer: React.forwardRef(function MockMapContainer(
      { children }: { children?: React.ReactNode },
      ref: React.Ref<unknown>,
    ) {
      React.useImperativeHandle(ref, () => fakeMap);
      return <div data-testid="map-container">{children}</div>;
    }),
    TileLayer: () => <div data-testid="tile-layer" />,
    Marker: ({
      position,
      children,
    }: {
      position: unknown;
      children?: React.ReactNode;
    }) => (
      <div data-testid="marker" data-position={JSON.stringify(position)}>
        {children}
      </div>
    ),
    Popup: ({ children }: { children?: React.ReactNode }) => (
      <div data-testid="popup">{children}</div>
    ),
  };
});

import SpotMap from "@/components/SpotMap";

function makeImageFile(name = "photo.jpg"): File {
  return new File([new Uint8Array(1024)], name, { type: "image/jpeg" });
}

const unconfirmedSpot: Spot = {
  id: "spot-1",
  name: "Rio Hondo Boardwalk",
  note: "Great sunset view, watch your step on loose planks.",
  lat: 6.9,
  lng: 122.05,
  status: "unconfirmed",
  confirmations: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const confirmedSpot: Spot = {
  id: "spot-2",
  name: "Pasonanca Park",
  note: "Nice picnic spot with a small zoo nearby.",
  lat: 6.95,
  lng: 122.08,
  status: "confirmed",
  confirmations: 3,
  createdAt: "2026-01-02T00:00:00.000Z",
};

function baseProps() {
  return {
    spots: [] as readonly Spot[],
    confirmedSpotIds: new Set<string>(),
    onCreateSpot: vi.fn().mockResolvedValue(undefined),
    onConfirmSpot: vi.fn().mockResolvedValue(undefined),
    onReportSpot: vi.fn().mockResolvedValue(undefined),
  };
}

describe("SpotMap -- tap-to-place wiring", () => {
  it("shows a visible affordance to arm placement mode, and a tap on the map does nothing before it's armed", () => {
    render(<SpotMap {...baseProps()} spots={[]} />);

    expect(screen.getByRole("button", { name: /add a spot/i })).toBeInTheDocument();

    act(() => {
      emitMapClick(6.91, 122.06);
    });

    expect(screen.queryByLabelText(/^name$/i)).not.toBeInTheDocument();
  });

  it("arms placement mode on FAB click, then opens AddSpotForm pre-filled with the tapped lat/lng", async () => {
    const user = userEvent.setup();
    render(<SpotMap {...baseProps()} spots={[]} />);

    await user.click(screen.getByRole("button", { name: /add a spot/i }));
    expect(screen.getByText(/tap the map/i)).toBeInTheDocument();

    act(() => {
      emitMapClick(6.91, 122.06);
    });

    expect(screen.getByLabelText((c) => c.trim().toLowerCase() === "name")).toBeInTheDocument();
  });

  it("submitting the form calls onCreateSpot with the tapped lat/lng, then closes the form and exits placement mode on success", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    render(<SpotMap {...props} spots={[]} />);

    await user.click(screen.getByRole("button", { name: /add a spot/i }));
    act(() => {
      emitMapClick(6.91, 122.06);
    });

    await user.type(screen.getByLabelText((c) => c.trim().toLowerCase() === "name"), "New Spot");
    await user.type(
      screen.getByLabelText((c) => c.trim().toLowerCase() === "note"),
      "A short note about it.",
    );
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, makeImageFile());

    const submitButton = document.querySelector('button[type="submit"]') as HTMLButtonElement;
    await user.click(submitButton);

    expect(props.onCreateSpot).toHaveBeenCalledTimes(1);
    expect(props.onCreateSpot).toHaveBeenCalledWith(
      expect.objectContaining({ name: "New Spot", lat: 6.91, lng: 122.06 }),
    );

    // Form closes and placement mode ends -- FAB affordance is back.
    expect(await screen.findByRole("button", { name: /add a spot/i })).toBeInTheDocument();
    expect(screen.queryByLabelText((c) => c.trim().toLowerCase() === "name")).not.toBeInTheDocument();
  });

  it("shows an inline error and keeps the form open (input preserved) when onCreateSpot rejects", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    props.onCreateSpot = vi.fn().mockRejectedValue(new Error("Upload failed, try again."));
    render(<SpotMap {...props} spots={[]} />);

    await user.click(screen.getByRole("button", { name: /add a spot/i }));
    act(() => {
      emitMapClick(6.91, 122.06);
    });

    const nameInput = screen.getByLabelText((c) => c.trim().toLowerCase() === "name");
    await user.type(nameInput, "New Spot");
    await user.type(
      screen.getByLabelText((c) => c.trim().toLowerCase() === "note"),
      "A short note about it.",
    );
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, makeImageFile());

    const submitButton = document.querySelector('button[type="submit"]') as HTMLButtonElement;
    await user.click(submitButton);

    expect(await screen.findByText(/upload failed, try again/i)).toBeInTheDocument();
    // Form is still open and the user's input was not lost.
    expect(screen.getByLabelText((c) => c.trim().toLowerCase() === "name")).toHaveValue("New Spot");
  });

  it("Cancel on the form closes it and exits placement mode without calling onCreateSpot", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    render(<SpotMap {...props} spots={[]} />);

    await user.click(screen.getByRole("button", { name: /add a spot/i }));
    act(() => {
      emitMapClick(6.91, 122.06);
    });

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(props.onCreateSpot).not.toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: /add a spot/i })).toBeInTheDocument();
  });
});

describe("SpotMap -- confirm wiring", () => {
  it("renders a Confirm control per spot and calls onConfirmSpot with the spot id on click", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    render(<SpotMap {...props} spots={[unconfirmedSpot]} />);

    await user.click(screen.getByRole("button", { name: /confirm/i }));

    expect(props.onConfirmSpot).toHaveBeenCalledWith(unconfirmedSpot.id);
  });

  it("passes confirmedByMe:true from the confirmedSpotIds set, rendering the disabled 'you confirmed' state", () => {
    const props = baseProps();
    render(<SpotMap {...props} spots={[unconfirmedSpot]} confirmedSpotIds={new Set([unconfirmedSpot.id])} />);

    const button = screen.getByRole("button", { name: /you confirmed this spot/i });
    expect(button).toBeDisabled();
  });

  it("renders spots at/above the threshold as the settled Confirmed badge, independent of local confirmedSpotIds", () => {
    const props = baseProps();
    render(<SpotMap {...props} spots={[confirmedSpot]} confirmedSpotIds={new Set()} />);

    // Both the popup's status label and ConfirmButton's own badge read
    // "Confirmed" once a spot is past the threshold -- there is no
    // clickable "Confirm" control left for it.
    expect(screen.getAllByText(/^confirmed$/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole("button", { name: /confirm/i })).not.toBeInTheDocument();
  });
});

describe("SpotMap -- report wiring", () => {
  it("submitting the Report form calls onReportSpot with spot id, reason, and details", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    render(<SpotMap {...props} spots={[unconfirmedSpot]} />);

    await user.click(screen.getByRole("button", { name: /report/i }));

    const popup = screen.getByTestId("popup");
    const select = within(popup).getByLabelText(/reason/i);
    fireEvent.change(select, { target: { value: "closed" } });
    await user.type(within(popup).getByLabelText(/details/i), "It's gone now.");
    await user.click(within(popup).getByRole("button", { name: /submit report/i }));

    expect(props.onReportSpot).toHaveBeenCalledWith(unconfirmedSpot.id, "closed", "It's gone now.");
  });

  it("shows a brief inline acknowledgment after a report is submitted, and the spot itself is unaffected", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    render(<SpotMap {...props} spots={[unconfirmedSpot]} />);

    await user.click(screen.getByRole("button", { name: /report/i }));
    await user.click(screen.getByRole("button", { name: /submit report/i }));

    expect(await screen.findByText(/reported/i)).toBeInTheDocument();
    // The spot's own status/name/note are untouched by a report.
    expect(screen.getByText(unconfirmedSpot.name)).toBeInTheDocument();
    expect(screen.getByText(/unconfirmed/i)).toBeInTheDocument();
  });
});
