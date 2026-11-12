import { Languages } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/contexts/LanguageContext"
import { t } from "@/lib/i18n"

/** Header switch between English and Nepali (saved to the account when signed in). */
export function LanguageToggle() {
  const { lang, setLanguage } = useLanguage()
  const next = lang === "ne" ? "en" : "ne"
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-9 gap-1.5 rounded-lg px-2.5 text-xs font-medium"
      onClick={() => void setLanguage(next)}
      aria-label={t("Change language")}
      title={t("Change language")}
    >
      <Languages className="h-4 w-4" />
      <span lang={next}>{next === "ne" ? "नेपाली" : "English"}</span>
    </Button>
  )
}
