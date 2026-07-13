import type { WorkplacesRow } from "./sync";

export type Profile = {
  firstName: string;
  lastName: string | null;
};

export type ProfileRow = {
  user_id: string;
  first_name: string;
  last_name: string | null;
  created_at: string;
};

export function profileRowToProfile(row: ProfileRow): Profile {
  return {
    firstName: row.first_name,
    lastName: row.last_name,
  };
}

export function profileToUpsert(profile: Profile, userId: string) {
  return {
    user_id: userId,
    first_name: profile.firstName,
    last_name: profile.lastName || null,
  };
}

// Gates /app: a profile is complete once both the profiles row and the
// workplaces row exist — an incomplete profile is redirected to /onboarding.
export function isOnboardingComplete(
  profileRow: ProfileRow | null,
  workplacesRow: WorkplacesRow | null
): boolean {
  return profileRow != null && workplacesRow != null;
}
