import { apiClient } from "@/api/api"
import { downloadFile } from "@/lib/download"

export type VoteCategory = "policy" | "bill" | "investment" | "loan" | "budget" | "election" | "other"
export type MinutesStatus = "draft" | "submitted" | "approved" | "signed"

export const VOTE_CATEGORIES: { value: VoteCategory; label: string }[] = [
  { value: "policy", label: "Policy" },
  { value: "bill", label: "Bill / proposal" },
  { value: "investment", label: "Investment" },
  { value: "loan", label: "Loan" },
  { value: "budget", label: "Budget / expense" },
  { value: "election", label: "Election" },
  { value: "other", label: "Other" },
]
export const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(VOTE_CATEGORIES.map((c) => [c.value, c.label]))

export interface Vote {
  category: VoteCategory
  votes_for: number
  votes_against: number
  abstained: number
}

export interface VoteOut extends Vote {
  result: "passed" | "not_passed"
  unanimous: boolean
}

export interface AgendaItem {
  title: string
  discussion: string | null
  decision: string | null
  vote: Vote | null
}

export interface Minutes {
  id: string
  title: string
  meeting_type: "online" | "in_person"
  held_at: string
  location: string | null
  event_id: string | null
  chaired_by: string
  recorded_by_name: string
  attendees: { id: string; name: string }[]
  guests: string | null
  members_total: number
  agenda: (Omit<AgendaItem, "vote"> & { vote: VoteOut | null })[]
  other_business: string | null
  status: MinutesStatus
  submitted_at: string | null
  reviewed_by_name: string | null
  reviewed_at: string | null
  return_note: string | null
  reference: string | null
  created_at: string
  can_edit: boolean
  can_review: boolean
  has_pdf: boolean
  signatures: {
    user_id: string
    name: string
    status: "pending" | "signed" | "declined"
    signed_at: string | null
    has_image: boolean
    note: string | null
  }[]
  signed_count: number
  my_signature: "pending" | "signed" | "declined" | null
  can_sign: boolean
}

export interface MinutesSummary {
  id: string
  title: string
  meeting_type: "online" | "in_person"
  held_at: string
  status: MinutesStatus
  reference: string | null
  present: number
  members_total: number
  resolutions: number
  passed: number
  recorded_by_name: string
  can_review: boolean
  signed_count: number
  needs_my_signature: boolean
}

export interface Resolution {
  minutes_id: string
  reference: string | null
  held_at: string
  meeting_title: string
  title: string
  decision: string | null
  category: VoteCategory
  votes_for: number
  votes_against: number
  abstained: number
  present: number
  result: "passed" | "not_passed"
  unanimous: boolean
}

export interface MinutesPayload {
  title: string
  meeting_type: "online" | "in_person"
  held_at: string
  location: string | null
  event_id: string | null
  chaired_by: string
  attendee_ids: string[]
  guests: string | null
  agenda: AgendaItem[]
  other_business: string | null
}

/** Simple majority of those voting; unanimous when nobody was against or abstained. */
export function voteResult(v: Vote): { passed: boolean; unanimous: boolean } {
  return { passed: v.votes_for > v.votes_against, unanimous: v.votes_for > 0 && !v.votes_against && !v.abstained }
}

export const listMinutes = async () =>
  (await apiClient.get("/minutes")).data as { items: MinutesSummary[]; can_write: boolean }
export const getMinutes = async (id: string) => (await apiClient.get(`/minutes/${id}`)).data as Minutes
export const createMinutes = async (p: MinutesPayload) => (await apiClient.post("/minutes", p)).data as Minutes
export const updateMinutes = async (id: string, p: MinutesPayload) =>
  (await apiClient.put(`/minutes/${id}`, p)).data as Minutes
export const submitMinutes = async (id: string) => (await apiClient.post(`/minutes/${id}/submit`)).data as Minutes
export const approveMinutes = async (id: string) => (await apiClient.post(`/minutes/${id}/approve`)).data as Minutes
export const returnMinutes = async (id: string, reason: string) =>
  (await apiClient.post(`/minutes/${id}/return`, { reason })).data as Minutes
export const signMinutes = async (id: string, signatureImage: string) =>
  (await apiClient.post(`/minutes/${id}/sign`, { signature_image: signatureImage })).data as Minutes
export const declineMinutes = async (id: string, reason: string) =>
  (await apiClient.post(`/minutes/${id}/decline`, { reason })).data as Minutes
export const signatureImageUrl = (minutesId: string, userId: string) =>
  `/minutes/${minutesId}/signatures/${userId}/image`
export const listResolutions = async () => (await apiClient.get("/minutes/resolutions")).data as Resolution[]
export const prefillMinutes = async (eventId: string, occurrence: string) =>
  (await apiClient.get("/minutes/prefill", { params: { event_id: eventId, occurrence } })).data as {
    title: string
    meeting_type: "online" | "in_person"
    held_at: string
    location: string | null
    event_id: string
    suggested_attendee_ids: string[]
  }
export const fetchDirectory = async () =>
  (await apiClient.get("/users/directory")).data as { id: string; name: string; roles: string[] }[]
export const downloadMinutesPdf = (m: { id: string; reference: string | null }) =>
  downloadFile(`/minutes/${m.id}/pdf`, `${(m.reference ?? "minutes").replaceAll("/", "-")}.pdf`)
