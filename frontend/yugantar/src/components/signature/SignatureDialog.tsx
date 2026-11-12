import { t } from "@/lib/i18n"
import { useState } from "react"
import { Loader2, PenLine } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { SignaturePad } from "./SignaturePad"

interface Props {
  open: boolean
  title: string
  description?: React.ReactNode
  confirmLabel: string
  /** Shown above the pad, e.g. the signer's name and today's date */
  signingAs?: string
  onCancel: () => void
  /** Resolve true to close; false keeps the dialog open (e.g. after an error) */
  onConfirm: (signatureDataUrl: string) => Promise<boolean>
}

/** Ask for a hand signature (draw or upload) before an action, e.g. "Sign & open". */
export function SignatureDialog({ open, title, description, confirmLabel, signingAs, onCancel, onConfirm }: Props) {
  const [signature, setSignature] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const cancel = () => {
    setSignature(null)
    onCancel()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && cancel()}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {signingAs && <p className="text-xs text-muted-foreground">{signingAs}</p>}
        {/* Remount the pad each time the dialog opens, so it starts empty */}
        {open && <SignaturePad onChange={setSignature} />}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" disabled={busy} onClick={cancel}>
            {t("Cancel")}</Button>
          <Button
            disabled={!signature || busy}
            onClick={async () => {
              if (!signature) return
              setBusy(true)
              try {
                if (await onConfirm(signature)) setSignature(null)
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PenLine className="mr-2 h-4 w-4" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
