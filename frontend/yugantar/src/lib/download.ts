import { apiClient } from "@/api/api"

/** Download an authenticated file (e.g. the loan agreement PDF). */
export async function downloadFile(url: string, filename: string): Promise<void> {
  const res = await apiClient.get(url, { responseType: "blob" })
  const href = URL.createObjectURL(res.data as Blob)
  const a = document.createElement("a")
  a.href = href
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(href), 1000)
}

/** A policy's adoption record (letterhead PDF); any member, once adopted. */
export const downloadPolicyRecord = (type: "deposit" | "loan", policyId: string, reference?: string | null) =>
  downloadFile(
    `/policies/${type}/${policyId}/record`,
    `${reference ? reference.replaceAll("/", "-") : `policy-record-${policyId.split("-")[0].toUpperCase()}`}.pdf`,
  )

/** Preview of a policy's record while signing is open (watermarked, not stored). */
export const downloadPolicyPreview = (type: "deposit" | "loan", policyId: string) =>
  downloadFile(`/policies/${type}/${policyId}/record/preview`, `policy-preview-${policyId.split("-")[0].toUpperCase()}.pdf`)

/** Loan agreement PDF for a loan (applicant, guarantor, office bearers). */
export const downloadLoanAgreement = (loanId: string) =>
  downloadFile(`/loans/${loanId}/agreement`, `loan-agreement-LN-${loanId.split("-")[0].toUpperCase()}.pdf`)
