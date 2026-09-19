"use client";

import dynamic from "next/dynamic";

import type { AuthStatus } from "@/lib/auth";
import type { Spot } from "@/lib/spots";
import type { NewSpotInput, ReportReason } from "@/lib/validation";

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
  confirmedSpotIds: ReadonlySet<string>;
  authStatus: AuthStatus;
  nickname?: string;
  onCreateSpot: (input: NewSpotInput) => Promise<void>;
  onConfirmSpot: (spotId: string) => Promise<void>;
  onReportSpot: (spotId: string, reason: ReportReason, details?: string) => Promise<void>;
}

export default function MapView({
  spots,
  confirmedSpotIds,
  authStatus,
  nickname,
  onCreateSpot,
  onConfirmSpot,
  onReportSpot,
}: MapViewProps) {
  return (
    <SpotMap
      spots={spots}
      confirmedSpotIds={confirmedSpotIds}
      authStatus={authStatus}
      nickname={nickname}
      onCreateSpot={onCreateSpot}
      onConfirmSpot={onConfirmSpot}
      onReportSpot={onReportSpot}
    />
  );
}
