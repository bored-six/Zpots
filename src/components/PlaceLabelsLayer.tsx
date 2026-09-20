"use client";

import { useEffect } from "react";
import L from "leaflet";
import type { Map as LeafletMap } from "leaflet";

import { createPlaceLabelIcon } from "@/lib/place-label-icon";
import { visiblePlaceLabels } from "@/lib/places";
import { ZAMBOANGA_PLACES } from "@/data/zamboanga-places";

const PLACE_LABELS_PANE = "placeLabels";

interface PlaceLabelsLayerProps {
  map: LeafletMap | null;
}

/**
 * Draws the curated place-name labels (src/data/zamboanga-places.ts) as
 * non-interactive divIcon markers in their own `placeLabels` pane, z 450
 * (D3 in .claude/prds/pergamino-map.md -- above the cream city mask so
 * labels stay legible, below spot pins so a pin is never hidden behind a
 * word). Rebuilds the marker set on every `zoomend`, skipping rebuilds
 * that land on the same zoom so panning doesn't churn markers.
 *
 * Takes the live Leaflet map as an explicit prop rather than calling
 * `useMap()` (D4): `SpotMap` already holds the instance via
 * `ref={setLeafletMap}`, and the nine existing `react-leaflet` mocks across
 * the test suite don't stand in for imperative map calls -- an explicit
 * prop needs none of them to change. In jsdom `map` is always `null` (the
 * `MapContainer` stand-ins are plain function components, so `ref` is a
 * silent no-op), so this renders nothing there.
 */
export default function PlaceLabelsLayer({ map }: PlaceLabelsLayerProps) {
  useEffect(() => {
    if (!map) return;

    // Idempotent, same contract as CityMask: only ever create the pane once.
    if (!map.getPane(PLACE_LABELS_PANE)) {
      const pane = map.createPane(PLACE_LABELS_PANE);
      pane.style.zIndex = "450";
    }

    let group: L.LayerGroup | null = null;
    let renderedZoom: number | undefined;

    function render(zoom: number) {
      const next = L.layerGroup(
        visiblePlaceLabels(ZAMBOANGA_PLACES, zoom).map((place) =>
          L.marker([place.lat, place.lng], {
            icon: createPlaceLabelIcon(place),
            pane: PLACE_LABELS_PANE,
            interactive: false,
            keyboard: false,
          }),
        ),
      );

      if (group) {
        map!.removeLayer(group);
      }
      next.addTo(map!);
      group = next;
      renderedZoom = zoom;
    }

    render(map.getZoom());

    function handleZoomEnd() {
      const zoom = map!.getZoom();
      if (zoom === renderedZoom) return;
      render(zoom);
    }

    map.on("zoomend", handleZoomEnd);

    return () => {
      map.off("zoomend", handleZoomEnd);
      if (group) {
        map.removeLayer(group);
      }
    };
  }, [map]);

  return null;
}
