export const SEX_OPTIONS = {
  female: "Female",
  male: "Male",
  other: "Other",
  prefer_not_to_say: "Prefer not to say",
} as const;
export type Sex = keyof typeof SEX_OPTIONS;

export const PROFILE_FIELDS = [
  "fullName",
  "dateOfBirth",
  "sex",
  "phone",
  "address",
  "emergencyName",
  "emergencyPhone",
  "allergies",
] as const;

export type ProfileState = { error?: string; values?: Record<string, string> };
