import { IsochroneAppClient } from "@/components/isochrone-app-client";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5">
        <h1 className="text-sm font-semibold text-foreground">The Good Spot</h1>
        <p className="text-sm text-muted-foreground">
          où vivre à mi-chemin, en vrais temps de trajet
        </p>
      </header>
      <IsochroneAppClient />
    </div>
  );
}
