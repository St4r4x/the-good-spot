"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TravelMode } from "@/lib/api";
import { useState } from "react";

const STORAGE_KEY = "isochrone-workplaces";

const TRAVEL_MODE_LABELS: Record<TravelMode, string> = {
  transit: "Transports en commun",
  walk: "Marche",
  bicycle: "Vélo",
  drive: "Voiture",
};

type SavedWorkplaces = {
  address1: string;
  address2: string;
  minutes: string;
  modes: TravelMode[];
};

type WorkplaceFormProps = {
  onSubmit: (address1: string, address2: string, minutes: number, modes: TravelMode[]) => void;
  isLoading: boolean;
};

function readSavedWorkplaces(): SavedWorkplaces {
  const defaults: SavedWorkplaces = {
    address1: "",
    address2: "",
    minutes: "30",
    modes: ["transit"],
  };
  if (typeof window === "undefined") return defaults;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return defaults;
  try {
    const parsed = { ...defaults, ...JSON.parse(raw) };
    if (!Array.isArray(parsed.modes) || parsed.modes.length === 0) parsed.modes = defaults.modes;
    return parsed;
  } catch {
    // localStorage content is user-editable; a corrupt value just falls back to defaults.
    return defaults;
  }
}

export function WorkplaceForm({ onSubmit, isLoading }: WorkplaceFormProps) {
  const [saved] = useState(readSavedWorkplaces);
  const [address1, setAddress1] = useState(saved.address1);
  const [address2, setAddress2] = useState(saved.address2);
  const [minutes, setMinutes] = useState(saved.minutes);
  const [modes, setModes] = useState<TravelMode[]>(saved.modes);

  function toggleMode(value: TravelMode) {
    setModes((prev) =>
      prev.includes(value) ? prev.filter((m) => m !== value) : [...prev, value]
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (modes.length === 0) return;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ address1, address2, minutes, modes })
    );
    onSubmit(address1, address2, Number(minutes), modes);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-3 p-4"
    >
      <div className="flex min-w-48 flex-1 flex-col gap-1.5">
        <Label htmlFor="address1">Lieu de travail 1</Label>
        <Input
          id="address1"
          value={address1}
          onChange={(e) => setAddress1(e.target.value)}
          placeholder="Adresse du 1er lieu de travail"
          required
        />
      </div>
      <div className="flex min-w-48 flex-1 flex-col gap-1.5">
        <Label htmlFor="address2">Lieu de travail 2</Label>
        <Input
          id="address2"
          value={address2}
          onChange={(e) => setAddress2(e.target.value)}
          placeholder="Adresse du 2e lieu de travail"
          required
        />
      </div>
      <div className="flex w-24 flex-col gap-1.5">
        <Label htmlFor="minutes">Minutes</Label>
        <Input
          id="minutes"
          type="number"
          min={1}
          max={60}
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Moyens de transport</Label>
        <div className="flex flex-wrap gap-3">
          {Object.entries(TRAVEL_MODE_LABELS).map(([value, label]) => (
            <label key={value} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={modes.includes(value as TravelMode)}
                onChange={() => toggleMode(value as TravelMode)}
                className="accent-primary"
              />
              {label}
            </label>
          ))}
        </div>
      </div>
      <Button type="submit" disabled={isLoading || modes.length === 0}>
        {isLoading ? "Calcul…" : "Calculer la zone"}
      </Button>
    </form>
  );
}
