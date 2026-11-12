import { t } from "@/lib/i18n"
import { useCallback, useRef, useState } from "react"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ConfirmContext, type ConfirmOptions, type ConfirmResult } from "./confirmContext"

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const [note, setNote] = useState("")
  const resolver = useRef<((r: ConfirmResult) => void) | null>(null)

  const confirm = useCallback((opts: ConfirmOptions) => {
    setNote("")
    setOptions(opts)
    return new Promise<ConfirmResult>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const close = (result: ConfirmResult) => {
    resolver.current?.(result)
    resolver.current = null
    setOptions(null)
  }

  const noteMissing = !!options?.note?.required && !note.trim()

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={!!options} onOpenChange={(open) => !open && close({ confirmed: false })}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{options?.title}</AlertDialogTitle>
            {options?.description && <AlertDialogDescription>{options.description}</AlertDialogDescription>}
          </AlertDialogHeader>
          {options?.note && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirm-note" className="text-xs">
                {options.note.label}
              </Label>
              <Textarea
                id="confirm-note"
                autoFocus
                value={note}
                maxLength={500}
                placeholder={options.note.placeholder}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>{options?.cancelLabel ?? t("Cancel")}</AlertDialogCancel>
            <Button
              variant={options?.destructive ? "destructive" : "default"}
              disabled={noteMissing}
              onClick={() => close({ confirmed: true, note: note.trim() })}
            >
              {options?.confirmLabel ?? t("Confirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  )
}
