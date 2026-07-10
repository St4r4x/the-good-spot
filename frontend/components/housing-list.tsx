"use client";

import type { HousingMarker } from "@/lib/housing";
import { cn } from "@/lib/utils";
import { CircleAlert, CircleCheck, X } from "lucide-react";

type HousingListProps = {
  items: HousingMarker[];
  onRemove: (index: number) => void;
  onFocus: (index: number) => void;
};

export function HousingList({ items, onRemove, onFocus }: HousingListProps) {
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2 px-4 pb-4">
      {items.map((h, i) => (
        <li key={`${h.lat},${h.lon},${i}`} className="rounded-lg border border-border p-2.5 text-sm">
          <div className="flex items-start justify-between gap-2">
            <button
              type="button"
              onClick={() => onFocus(i)}
              className="cursor-pointer text-left font-medium transition-colors duration-150 hover:text-primary motion-reduce:transition-none"
            >
              {h.resolvedAddress}
            </button>
            <button
              type="button"
              onClick={() => onRemove(i)}
              aria-label={`Supprimer ${h.resolvedAddress}`}
              className="cursor-pointer p-1 text-muted-foreground transition-colors duration-150 hover:text-destructive motion-reduce:transition-none"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
          <p
            className={cn(
              "mt-1 flex items-center gap-1 text-xs font-medium",
              h.inZone ? "text-primary" : "text-muted-foreground"
            )}
          >
            {h.inZone ? (
              <CircleCheck aria-hidden className="size-3.5" />
            ) : (
              <CircleAlert aria-hidden className="size-3.5" />
            )}
            {h.inZone ? "Dans la zone" : "Hors zone"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Lieu 1 : {h.timeToWork1Minutes} min · Lieu 2 : {h.timeToWork2Minutes} min
          </p>
        </li>
      ))}
    </ul>
  );
}
