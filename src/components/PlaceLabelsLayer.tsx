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
 * non-interactive divIcon markers in their own `placeLabels` pane, z 340
 * (D3 in .claude/prds/pergamino-map.md, revised by the label-tuning pass --
 * below the cream city mask (350) so a label is masked exactly like every
 * canvas-drawn label whenever its anchor point falls outside the city, and
 * above the tile pane (200, Leaflet's own default) so it still draws over
 * the ground/roads everywhere else; below spot pins so a pin is never
 * hidden behind a word). This pane used to sit at 450, *above* the mask --
 * that let "Mar de Basilán"/"Bahía de Zamboanga" paint over masked-out
 * territory outside the city while every canvas label underneath was
 * correctly hidden; see the PRD's Change Log for the fix. Rebuilds the
 * marker set on every `zoomend`, skipping rebuilds that land on the same
 * zoom so panning doesn't churn markers.
 *
 * Since the labels reversal (see the PRD's Change Log), this is a small
 * exception list, not the map's naming system -- settlement, district,
 * street, and POI names are now drawn from the tile archive itself via
 * `buildLabelRules` (BasemapLayer.tsx), which carries protomaps-leaflet's
 * own label collision handling. `ZAMBOANGA_PLACES` now holds only the two
 * Spanish/Chavacano water names ("Mar de Basilán", "Bahía de Zamboanga")
 * the archive has no in-view equivalent for -- everything that used to
 * duplicate a real tile name (every landmark, every barangay) was retired.
 * Because this pane and the tile canvas don't share one collision index,
 * keeping this list short is what keeps the two systems from fighting --
 * not a coordination mechanism between them. Folding these two names into
 * `buildLabelRules` instead (one shared collision index, no second system
 * at all) was considered and rejected for the label-tuning pass: the
 * archive carries no `water` feature for either name in view (see
 * zamboanga-places.ts's own doc comment), and `buildLabelRules` only draws
 * names the archive already has -- there is nothing in the tile data to
 * point a LabelRule at. Moving this pane below the mask (above) is the
 * next-best fix: it closes the masking half of the inconsistency (a
 * label is now hidden outside the city exactly like a canvas label is),
 * and leaves the collision-index gap exactly as already documented above:
 * a real but low-probability risk at two entries, both over open water.
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
      pane.style.zIndex = "340";
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
