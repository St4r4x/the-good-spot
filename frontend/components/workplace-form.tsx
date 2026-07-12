"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TravelMode } from "@/lib/api";
import type { SavedWorkplaces } from "@/lib/sync";
import { cn } from "@/lib/utils";
import { Bike, Bus, Car, Check, Footprints } from "lucide-react";
import { useState } from "react";

const TRAVEL_MODES: { value: TravelMode; label: string; Icon: typeof Bus }[] = [
  { value: "transit", label: "Transports", Icon: Bus },
  { value: "walk", label: "Marche", Icon: Footprints },
  { value: "bicycle", label: "Vélo", Icon: Bike },
  { value: "drive", label: "Voiture", Icon: Car },
];

const DEFAULT_INITIAL_WORKPLACES: SavedWorkplaces = {
  address1: "",
  address2: "",
  minutes: "30",
  modes: ["transit"],
};

type WorkplaceFormProps = {
  onSubmit: (address1: string, address2: string, minutes: number, modes: TravelMode[]) => void;
  isLoading: boolean;
  resolved1: string | null;
  resolved2: string | null;
  error: string | null;
  initialWorkplaces?: SavedWorkplaces;
};

export function WorkplaceForm({
  onSubmit,
  isLoading,
  resolved1,
  resolved2,
  error,
  initialWorkplaces = DEFAULT_INITIAL_WORKPLACES,
}: WorkplaceFormProps) {
  const [address1, setAddress1] = useState(initialWorkplaces.address1);
  const [address2, setAddress2] = useState(initialWorkplaces.address2);
  const [minutes, setMinutes] = useState(initialWorkplaces.minutes);
  const [modes, setModes] = useState<TravelMode[]>(initialWorkplaces.modes);

  function toggleMode(value: TravelMode) {
    setModes((prev) =>
      prev.includes(value) ? prev.filter((m) => m !== value) : [...prev, value]
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (modes.length === 0) return;
    onSubmit(address1, address2, Number(minutes), modes);
  }

  const resolvedFor = (resolved: string | null) =>
    resolved && (
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <Check aria-hidden className="size-3 shrink-0 text-primary" />
        {resolved}
      </p>
    );

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 px-4 pb-4">
      <h2 className="text-sm font-semibold text-foreground">1 · Vos lieux de travail</h2>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="address1">Lieu de travail 1</Label>
        <Input
          id="address1"
          value={address1}
          onChange={(e) => setAddress1(e.target.value)}
          placeholder="Adresse du 1er lieu de travail"
          required
        />
        {resolvedFor(resolved1)}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="address2">Lieu de travail 2</Label>
        <Input
          id="address2"
          value={address2}
          onChange={(e) => setAddress2(e.target.value)}
          placeholder="Adresse du 2e lieu de travail"
          required
        />
        {resolvedFor(resolved2)}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Moyens de transport</Label>
        <div className="flex flex-wrap gap-2">
          {TRAVEL_MODES.map(({ value, label, Icon }) => {
            const selected = modes.includes(value);
            return (
              <button
                key={value}
                type="button"
                aria-pressed={selected}
                onClick={() => toggleMode(value)}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none",
                  selected
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-background text-muted-foreground hover:bg-muted"
                )}
              >
                <Icon aria-hidden className="size-4" />
                {label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="minutes">Temps de trajet max</Label>
        <div className="flex items-center gap-2">
          <Input
            id="minutes"
            type="number"
            min={1}
            max={60}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            className="w-24"
            required
          />
          <span className="text-sm text-muted-foreground">min</span>
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={isLoading || modes.length === 0}>
        {isLoading && (
          <span
            aria-hidden
            className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
          />
        )}
        {isLoading ? "Calcul…" : "Calculer la zone"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
