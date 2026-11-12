import { t } from "@/lib/i18n"
import { useEffect, useState } from "react"
import { Languages, Loader2, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { apiClient } from "@/api/api"

/*
 * The policy's wording in English and Nepali, as members will read and sign it.
 *
 * By default both are generated from the terms (server templates, updated as
 * the Treasurer types). The Treasurer can edit either; an edited text is kept
 * as is (null = automatic). Wording is locked once the policy is opened for
 * signing, like the terms.
 */

export interface Wording {
  en: string | null // null = automatic
  ne: string | null
}

interface Props {
  type: "deposit" | "loan"
  /** The policy terms as sent to the API, or null while the form is incomplete */
  payload: Record<string, unknown> | null
  value: Wording
  onChange: (value: Wording) => void
}

export function PolicyWordingEditor({ type, payload, value, onChange }: Props) {
  const [generated, setGenerated] = useState<{ en: string; ne: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const key = payload ? JSON.stringify(payload) : ""

  // Refresh the generated text shortly after the terms stop changing
  useEffect(() => {
    if (!key) return
    let cancelled = false
    const timer = setTimeout(() => {
      setLoading(true)
      apiClient
        .post(`/policies/${type}/statement-preview`, JSON.parse(key))
        .then((res) => {
          if (!cancelled) setGenerated({ en: res.data.statement_en, ne: res.data.statement_ne })
        })
        .catch(() => {}) // incomplete or invalid terms: keep the last text
        .finally(() => !cancelled && setLoading(false))
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [type, key])

  const field = (lang: "en" | "ne") => {
    const custom = value[lang]
    const auto = generated?.[lang] ?? ""
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={`wording-${lang}`} className="text-xs font-medium">
            {lang === "en" ? t("English") : t("नेपाली (Nepali)")}
            <span className="ml-1.5 font-normal text-muted-foreground">{custom === null ? t("· automatic") : t("· edited")}</span>
          </Label>
          {custom !== null && (
            <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onChange({ ...value, [lang]: null })}>
              <RotateCcw className="mr-1 h-3 w-3" /> {t(" Use automatic text")}</Button>
          )}
        </div>
        <Textarea
          id={`wording-${lang}`}
          lang={lang}
          rows={lang === "en" ? 4 : 5}
          maxLength={lang === "en" ? 2000 : 3000}
          placeholder={payload ? t("Generating…") : t("Fill in the terms above to see the wording")}
          value={custom ?? auto}
          onChange={(e) => onChange({ ...value, [lang]: e.target.value })}
          className="text-sm leading-relaxed"
        />
        {custom !== null && (
          <p className="text-[11px] text-warning-foreground dark:text-warning">
            {t("Edited text doesn't follow changes to the terms. Check it still matches them before saving.")}</p>
        )}
      </div>
    )
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Languages className="h-4 w-4 text-primary" /> {t(" Policy wording")}</p>
          <p className="text-[11px] text-muted-foreground">
            {t("The Nepali text members read and sign, printed on the adoption record. Written from the terms automatically; edit if needed.")}</p>
        </div>
        {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
      </div>
      {field("ne")}
    </section>
  )
}
