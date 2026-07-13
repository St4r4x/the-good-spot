import { describe, expect, it } from "vitest";
import {
  isOnboardingComplete,
  profileRowToProfile,
  profileToUpsert,
  type Profile,
  type ProfileRow,
} from "./profile";
import type { WorkplacesRow } from "./sync";

const PROFILE_ROW: ProfileRow = {
  user_id: "u1",
  first_name: "Jamie",
  last_name: null,
  created_at: "2026-07-12T00:00:00Z",
};

const WORKPLACES_ROW: WorkplacesRow = {
  user_id: "u1",
  address1: "1 rue A",
  address2: "2 rue B",
  minutes: 30,
  modes: ["transit"],
  default_poi_groups: [],
  updated_at: "2026-07-12T00:00:00Z",
};

describe("profileRowToProfile", () => {
  it("maps a Postgres row to the app's Profile shape", () => {
    const row: ProfileRow = {
      user_id: "u1",
      first_name: "Jamie",
      last_name: "Dupont",
      created_at: "2026-07-12T00:00:00Z",
    };
    expect(profileRowToProfile(row)).toEqual({
      firstName: "Jamie",
      lastName: "Dupont",
    });
  });

  it("maps a null last_name through unchanged", () => {
    const row: ProfileRow = {
      user_id: "u1",
      first_name: "Jamie",
      last_name: null,
      created_at: "2026-07-12T00:00:00Z",
    };
    expect(profileRowToProfile(row)).toEqual({
      firstName: "Jamie",
      lastName: null,
    });
  });
});

describe("profileToUpsert", () => {
  it("maps a Profile back to a Postgres upsert payload", () => {
    const profile: Profile = { firstName: "Jamie", lastName: "Dupont" };
    expect(profileToUpsert(profile, "u1")).toEqual({
      user_id: "u1",
      first_name: "Jamie",
      last_name: "Dupont",
    });
  });

  it("maps an empty optional last name to null", () => {
    const profile: Profile = { firstName: "Jamie", lastName: "" };
    expect(profileToUpsert(profile, "u1")).toEqual({
      user_id: "u1",
      first_name: "Jamie",
      last_name: null,
    });
  });
});

describe("isOnboardingComplete", () => {
  it("is false when the profile row is missing (redirect /app -> /onboarding)", () => {
    expect(isOnboardingComplete(null, WORKPLACES_ROW)).toBe(false);
  });

  it("is false when the workplaces row is missing (redirect /app -> /onboarding)", () => {
    expect(isOnboardingComplete(PROFILE_ROW, null)).toBe(false);
  });

  it("is true when both rows exist (no redirect, /app loads the map)", () => {
    expect(isOnboardingComplete(PROFILE_ROW, WORKPLACES_ROW)).toBe(true);
  });
});
