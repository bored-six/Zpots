import MapView from "@/components/MapView";
import { SEED_SPOTS } from "@/lib/spots";

export default function Home() {
  return (
    <main className="h-screen w-screen">
      <MapView spots={SEED_SPOTS} />
    </main>
  );
}
