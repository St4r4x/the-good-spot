import { IsochroneAppClient } from "@/components/isochrone-app-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "The Good Spot — carte",
  description:
    "Calculez la zone où vivre à mi-chemin de vos deux lieux de travail, en vrais temps de trajet.",
};

export default function AppPage() {
  return (
    <main className="relative h-dvh">
      <IsochroneAppClient />
    </main>
  );
}
