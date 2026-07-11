"use client";

import type { PoiGroup } from "@/lib/api";
import { POI_GROUPS_ORDER, POI_GROUP_ICONS, POI_GROUP_LABELS } from "@/lib/pois";
import { cn } from "@/lib/utils";

type PoiFiltersProps = {
  selected: PoiGroup[];
  onChange: (groups: PoiGroup[]) => void;
  disabled: boolean;
  error: string | null;
};

export function PoiFilters({ selected, onChange, disabled, error }: PoiFiltersProps) {
  function toggle(group: PoiGroup) {
    onChange(
      selected.includes(group) ? selected.filter((g) => g !== group) : [...selected, group]
    );
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border px-4 py-4">
      <h2 className="text-sm font-semibold text-foreground">2 · Points d&apos;intérêt</h2>
      {disabled && (
        <p className="text-xs text-muted-foreground">
          Calculez d&apos;abord la zone commune avec vos deux lieux de travail.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {POI_GROUPS_ORDER.map((group) => {
          const Icon = POI_GROUP_ICONS[group];
          const isSelected = selected.includes(group);
          return (
            <button
              key={group}
              type="button"
              aria-pressed={isSelected}
              disabled={disabled}
              onClick={() => toggle(group)}
              className={cn(
                "flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50",
                isSelected
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-muted"
              )}
            >
              <Icon aria-hidden className="size-4" />
              {POI_GROUP_LABELS[group]}
            </button>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
