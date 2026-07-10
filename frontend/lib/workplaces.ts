import type { TravelMode } from "./api";

export type SavedWorkplaces = {
  address1: string;
  address2: string;
  minutes: string;
  modes: TravelMode[];
};

export const WORKPLACES_STORAGE_KEY = "isochrone-workplaces";

const DEFAULTS: SavedWorkplaces = {
  address1: "",
  address2: "",
  minutes: "30",
  modes: ["transit"],
};

export function parseSavedWorkplaces(raw: string | null): SavedWorkplaces {
  if (!raw) return { ...DEFAULTS, modes: [...DEFAULTS.modes] };
  try {
    const parsed = { ...DEFAULTS, ...JSON.parse(raw) };
    if (!Array.isArray(parsed.modes) || parsed.modes.length === 0) {
      parsed.modes = [...DEFAULTS.modes];
    }
    return parsed;
  } catch {
    // localStorage content is user-editable; corrupt values fall back to defaults.
    return { ...DEFAULTS, modes: [...DEFAULTS.modes] };
  }
}

export function serializeWorkplaces(w: SavedWorkplaces): string {
  return JSON.stringify(w);
}
