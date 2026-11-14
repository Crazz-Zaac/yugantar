import { t } from "@/lib/i18n"
import { useEffect, useState } from "react"
import { apiClient } from "@/api/api"

/** A member's hand signature, loaded with the user's session (not a public URL). */
export function SignatureThumb({ url }: { url: string }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    apiClient
      .get(url, { responseType: "blob" })
      .then((res) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(res.data as Blob)
        setSrc(objectUrl)
      })
      .catch(() => {})
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [url])
  if (!src) return <span className="inline-block h-10 w-24 animate-pulse rounded bg-muted" />
  return (
    <span className="inline-flex rounded border bg-white px-1.5 py-0.5">
      <img src={src} alt={t("Hand signature")} className="h-9 max-w-[9rem] object-contain" />
    </span>
  )
}
