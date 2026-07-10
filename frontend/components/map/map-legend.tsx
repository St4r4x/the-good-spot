import { MAP_COLORS } from "@/lib/map-colors";

const ENTRIES = [
  { color: MAP_COLORS.zone1, label: "Zone lieu 1" },
  { color: MAP_COLORS.zone2, label: "Zone lieu 2" },
  { color: MAP_COLORS.intersection, label: "Zone commune" },
  { color: MAP_COLORS.housingIn, label: "Logement dans la zone" },
  { color: MAP_COLORS.housingOut, label: "Logement hors zone" },
];

export function MapLegend() {
  return (
    <div className="rounded-lg bg-card/95 px-3 py-2 text-xs text-foreground shadow-floating">
      <ul className="flex flex-col gap-1">
        {ENTRIES.map(({ color, label }) => (
          <li key={label} className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-3 shrink-0 rounded-sm"
              style={{ backgroundColor: color }}
            />
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
}
