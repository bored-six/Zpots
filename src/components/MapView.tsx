"use client";

import dynamic from "next/dynamic";

import type { Spot } from "@/lib/spots";

// Leaflet touches `window`, so SpotMap can only load on the client -- this
// wrapper is the client boundary that makes `ssr: false` legal, since
// next/dynamic with ssr:false cannot be called from a Server Component.
const SpotMap = dynamic(() => import("@/components/SpotMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-[#7a7368]">
      Loading map…
    </div>
  ),
});

interface MapViewProps {
  spots: readonly Spot[];
}

export default function MapView({ spots }: MapViewProps) {
  return <SpotMap spots={spots} />;
}
