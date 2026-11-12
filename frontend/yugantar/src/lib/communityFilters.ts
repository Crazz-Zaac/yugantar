// Shared state shape for the community-tab filters (see components/CommunityFilters.tsx)

export interface CommunityFilterValues {
  member: string
  dateFrom: string // YYYY-MM-DD, a Nepal calendar day
  dateTo: string
  choice: string // e.g. deposit type or loan status
  text: string // e.g. loan purpose
}

export const EMPTY_COMMUNITY_FILTERS: CommunityFilterValues = { member: "", dateFrom: "", dateTo: "", choice: "", text: "" }

/** Query params for the API; empty values are left out. */
export function communityFilterParams(
  v: CommunityFilterValues,
  names: { choice?: string; text?: string } = {},
): Record<string, string> {
  const params: Record<string, string> = {}
  if (v.member.trim()) params.member = v.member.trim()
  if (v.dateFrom) params.date_from = v.dateFrom
  if (v.dateTo) params.date_to = v.dateTo
  if (v.choice && names.choice) params[names.choice] = v.choice
  if (v.text.trim() && names.text) params[names.text] = v.text.trim()
  return params
}
