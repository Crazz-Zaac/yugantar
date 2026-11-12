import { t, roleName } from "@/lib/i18n"
// Types and helpers for policy approval by member signatures.
// Backend: app/api/v1/endpoints/policy_signing.py

export type PolicyType = "deposit" | "loan"
export type SignatureStatus = "pending" | "approved" | "rejected"
export type ProxyStatus = "pending" | "applied" | "declined" | "cancelled"

export interface ProxyAuthorisation {
  name: string
  roles: string[]
  approved: boolean
  note: string | null
  at: string | null
}

export interface ProxyRequest {
  id: string
  policy_type: PolicyType
  policy_id: string
  policy_label: string
  signer_user_id: string
  signer_name: string
  requested_by_name: string
  decision: SignatureStatus
  reason: string | null
  consultation_note: string
  status: ProxyStatus
  created_at: string | null
  resolved_at: string | null
  required_roles: string[]
  authorisations: ProxyAuthorisation[]
  can_authorise: boolean
}

export interface Signature {
  user_id: string
  name: string
  roles: string[]
  status: SignatureStatus
  signed_at: string | null
  reason: string | null
  counted: boolean
  /** A hand signature image is on file */
  has_signature_image: boolean
  proxy: ProxyRequest | null
}

export interface PolicyTerm {
  label: string
  value: string
}

export interface SigningSummary {
  policy_type: PolicyType
  policy_id: string
  label: string
  /** What the policy says (same wording as the PDF record) */
  title: string
  statement: string
  /** The same policy in Nepali */
  statement_ne: string
  /** The Treasurer edited the wording (otherwise generated from the terms) */
  statement_custom: boolean
  terms: PolicyTerm[]
  /** The adoption record PDF can be downloaded (policy adopted) */
  record_available: boolean
  record_reference: string | null
  /** Open for signing: a watermarked preview PDF of the record so far */
  preview_available: boolean
  status: "draft" | "finalized" | "active" | "expired" | "void"
  signing_deadline: string | null
  deadline_passed: boolean
  required: number
  approved: number
  rejected: number
  pending: number
  my_status: SignatureStatus | null
  signatures: Signature[]
}

export interface SigningTarget {
  type: PolicyType
  id: string
  label: string
}

/** The API's error message ("detail"), or a fallback. */
export function apiError(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof detail === "string" ? detail : fallback
}

export { formatDateTime } from "@/lib/datetime"
import { parseUtc } from "@/lib/datetime"

/** "3 days left", "5 hours left", or null once passed. */
export function timeLeft(iso: string | null | undefined): string | null {
  const deadline = parseUtc(iso)
  if (!deadline) return null
  const ms = deadline.getTime() - Date.now()
  if (ms <= 0) return null
  const hours = Math.floor(ms / 3_600_000)
  if (hours >= 48) return t("{0} days left", Math.floor(hours / 24))
  if (hours >= 1) return hours === 1 ? t("{0} hour left", 1) : t("{0} hours left", hours)
  return t("less than an hour left")
}

export function roleLabel(roles: string[]): string {
  const office = roles.filter((r) => r !== "member")
  return office.length ? office.map((r) => roleName(r)).join(", ") : t("Member")
}
