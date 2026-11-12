import { t } from "@/lib/i18n"
import { useEffect, useState } from "react"
import { AlertTriangle, ImageOff, Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { apiClient } from "@/api/api"
import { formatDateTime } from "@/lib/datetime"

interface ReceiptDuplicate {
  deposit_id: string
  user_id: string
  depositor_name: string | null
  deposited_date: string | null
  match: "same_image" | "same_reference"
}

interface ReceiptDetails {
  id: string
  uploaded_at: string
  expires_at: string
  image_available: boolean
  ocr_status: "pending" | "completed" | "failed"
  ocr_amount: string | number | null
  ocr_charge: string | number | null
  ocr_date: string | null
  ocr_reference: string | null
  submitted_amount: string | number | null
  submitted_date: string | null
  amount_differs_from_ocr: boolean
  date_differs_from_ocr: boolean
  duplicates: ReceiptDuplicate[]
}

function rs(value: string | number | null): string {
  if (value == null) return "—"
  return `Rs. ${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
}

interface Props {
  receiptId: string | null
  onClose: () => void
}

export default function ReceiptReviewDialog({ receiptId, onClose }: Props) {
  const [details, setDetails] = useState<ReceiptDetails | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageGone, setImageGone] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!receiptId) return
    let objectUrl: string | null = null
    let cancelled = false

    setLoading(true)
    setError(null)
    setDetails(null)
    setImageUrl(null)
    setImageGone(false)

    const load = async () => {
      try {
        const meta = await apiClient.get(`/receipts/${receiptId}`)
        if (cancelled) return
        const d = meta.data as ReceiptDetails
        setDetails(d)

        if (!d.image_available) {
          setImageGone(true)
          return
        }
        // Fetched with the auth header, then shown via a temporary object URL
        try {
          const img = await apiClient.get(`/receipts/${receiptId}/image`, { responseType: "blob" })
          if (cancelled) return
          objectUrl = URL.createObjectURL(img.data as Blob)
          setImageUrl(objectUrl)
        } catch {
          if (!cancelled) setImageGone(true)
        }
      } catch {
        if (!cancelled) setError(t("Could not load the receipt."))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [receiptId])

  const warnings: string[] = []
  if (details) {
    if (details.ocr_status === "failed") warnings.push(t("OCR couldn't read this voucher; all values were entered manually."))
    if (details.amount_differs_from_ocr)
      warnings.push(t("Amount was changed: OCR read {0}, submitted {1}.", rs(details.ocr_amount), rs(details.submitted_amount)))
    if (details.date_differs_from_ocr)
      warnings.push(t("Date was changed: OCR read {0}, submitted {1}.", formatDateTime(details.ocr_date), formatDateTime(details.submitted_date)))
    for (const dup of details.duplicates) {
      warnings.push(
        dup.match === "same_image"
          ? t("The same image was already used for {0}'s deposit of {1}.", dup.depositor_name ?? t("another member"), formatDateTime(dup.deposited_date))
          : t("The same bank reference appears on {0}'s deposit of {1}.", dup.depositor_name ?? t("another member"), formatDateTime(dup.deposited_date)),
      )
    }
  }

  return (
    <Dialog open={!!receiptId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("Deposit receipt")}</DialogTitle>
          <DialogDescription>
            {details
              ? t("Uploaded {0} · image kept until {1}", formatDateTime(details.uploaded_at), formatDateTime(details.expires_at))
              : t("Voucher image and OCR check")}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {details && !loading && (
          <div className="grid gap-4 md:grid-cols-[1fr_minmax(0,16rem)]">
            <div className="flex min-h-48 items-center justify-center rounded-md border bg-muted/30">
              {imageUrl ? (
                <img src={imageUrl} alt={t("Deposit voucher")} className="max-h-[70vh] w-auto rounded-md object-contain" />
              ) : imageGone ? (
                <div className="flex flex-col items-center gap-2 p-6 text-center text-sm text-muted-foreground">
                  <ImageOff className="h-6 w-6" />
                  {t("The image was deleted after the retention period.")}</div>
              ) : null}
            </div>

            <div className="flex flex-col gap-3 text-sm">
              {warnings.length > 0 && (
                <div className="flex flex-col gap-1.5 rounded-md border border-warning/40 bg-warning/10 p-3">
                  {warnings.map((w) => (
                    <p key={w} className="flex gap-1.5 text-xs">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                      {w}
                    </p>
                  ))}
                </div>
              )}
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
                <dt className="text-muted-foreground">{t("Submitted")}</dt>
                <dd className="font-mono font-semibold">{rs(details.submitted_amount)}</dd>
                <dt className="text-muted-foreground">{t("OCR amount")}</dt>
                <dd className="font-mono">{rs(details.ocr_amount)}</dd>
                <dt className="text-muted-foreground">{t("Bank charge")}</dt>
                <dd className="font-mono">{rs(details.ocr_charge)}</dd>
                <dt className="text-muted-foreground">{t("Submitted date")}</dt>
                <dd>{formatDateTime(details.submitted_date)}</dd>
                <dt className="text-muted-foreground">{t("OCR date")}</dt>
                <dd>{formatDateTime(details.ocr_date)}</dd>
                <dt className="text-muted-foreground">{t("Reference")}</dt>
                <dd className="break-all font-mono">{details.ocr_reference ?? "—"}</dd>
              </dl>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
