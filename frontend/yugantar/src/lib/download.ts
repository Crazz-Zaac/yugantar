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

/** Loan agreement PDF for a loan (applicant, guarantor, office bearers). */
export const downloadLoanAgreement = (loanId: string) =>
  downloadFile(`/loans/${loanId}/agreement`, `loan-agreement-LN-${loanId.split("-")[0].toUpperCase()}.pdf`)
