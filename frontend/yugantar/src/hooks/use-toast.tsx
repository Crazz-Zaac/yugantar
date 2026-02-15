export { }
import { useState } from "react"

export interface Toast {
    id: string
    title?: string
    description?: string
    action?: React.ReactNode
    [key: string]: any
}

export function useToast() {
    const [toasts, setToasts] = useState<Toast[]>([])
    // Add, remove, and clear toast logic as needed
    return {
        toasts,
        addToast: (toast: Toast) => setToasts((prev) => [...prev, toast]),
        removeToast: (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id)),
        clearToasts: () => setToasts([]),
    }
}
