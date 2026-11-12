/*
 * English / Nepali interface text.
 *
 * English is written in the code as usual; t("Make Deposit") returns the
 * Nepali from locales/ne.ts when Nepali is chosen (English otherwise, or if a
 * text has no translation yet). Values go in as {0}, {1}…:
 *   t("{0} of {1} members signed", approved, total)
 * so a whole sentence is translated (Nepali word order differs).
 *
 * Nepali style: Devanagari digits (n(), formatRs) and Bikram Sambat dates
 * (lib/datetime.ts). The app re-renders from the top when the language
 * changes (contexts/LanguageContext.tsx), so plain functions are enough.
 */

export type Lang = "en" | "ne"
export const LANGS: Lang[] = ["en", "ne"]

let current: Lang = "en"
let dictionary: Record<string, string> = {}

export const getLang = (): Lang => current

/** Switch language (loads the Nepali texts on first use). */
export async function loadLanguage(lang: Lang): Promise<void> {
  if (lang === "ne") {
    const mod = await import("@/locales/ne")
    dictionary = mod.default
  } else {
    dictionary = {}
  }
  current = lang
  if (typeof document !== "undefined") document.documentElement.lang = lang
}

const NE_DIGITS = "०१२३४५६७८९"

/** Devanagari digits: "12.5" -> "१२.५" */
export function neDigits(text: string): string {
  return text.replace(/[0-9]/g, (d) => NE_DIGITS[Number(d)])
}

/** A number for display: Devanagari digits in Nepali. */
export function n(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return ""
  const text = String(value)
  return current === "ne" ? neDigits(text) : text
}

/** Translate an English interface text; {0}, {1}… are replaced by `args`. */
export function t(text: string, ...args: unknown[]): string {
  const key = text.replace(/\s+/g, " ").trim()
  const lead = /^\s/.test(text) ? " " : ""
  const trail = /\s$/.test(text) ? " " : ""
  let out = current === "ne" ? dictionary[key] ?? key : key
  if (args.length) {
    out = out.replace(/\{(\d+)\}/g, (_, i: string) => {
      const v = args[Number(i)]
      if (typeof v === "number") return n(v)
      return v === null || v === undefined || v === false ? "" : String(v)
    })
  }
  return lead + out + trail
}

/** A cooperative role ("treasurer") as a label in the interface language. */
export function roleName(role: string): string {
  const r = String(role).toLowerCase()
  return t(r ? r[0].toUpperCase() + r.slice(1) : "")
}

/** A status/enum value from the API ("pending", "loan_principal") as a translated label. */
export function enumLabel(value: string | null | undefined): string {
  if (!value) return ""
  const text = String(value).replace(/_/g, " ")
  return t(text[0].toUpperCase() + text.slice(1))
}
