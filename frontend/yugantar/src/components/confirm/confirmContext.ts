import { createContext, useContext } from "react"

export interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Red confirm button, for actions that remove or clear things */
  destructive?: boolean
  /** Show a text field; its value is returned as `note` */
  note?: { label: string; placeholder?: string; required?: boolean }
}

export type ConfirmResult = { confirmed: false } | { confirmed: true; note: string }

export type ConfirmFn = (options: ConfirmOptions) => Promise<ConfirmResult>

export const ConfirmContext = createContext<ConfirmFn | null>(null)

/** Styled replacement for window.confirm / window.prompt:
 *    const confirm = useConfirm()
 *    const r = await confirm({ title: "Reject?", destructive: true })
 *    if (r.confirmed) ...
 */
export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext)
  if (!fn) throw new Error("useConfirm must be used inside <ConfirmProvider>")
  return fn
}
