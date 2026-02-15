export const ACCESS_ROLES = [
  "user",
  "moderator",
  "admin",
] as const;

export const COOPERATIVE_ROLES = [
  "member",
  "secretary",
  "treasurer",
  "president",
] as const;


// Type definitions for roles
export type AccessRole = typeof ACCESS_ROLES[number];
export type CooperativeRole = typeof COOPERATIVE_ROLES[number];