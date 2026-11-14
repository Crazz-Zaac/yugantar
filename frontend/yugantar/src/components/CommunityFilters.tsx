import { DateField } from "@/components/DateField"
import { t, n } from "@/lib/i18n"
import { Search, SlidersHorizontal, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { CommunityFilterValues } from "@/lib/communityFilters"

interface Props {
  values: CommunityFilterValues
  onChange: (values: CommunityFilterValues) => void
  /** Optional dropdown, e.g. deposit type or loan status */
  choice?: { label: string; options: { value: string; label: string }[] }
  /** Optional extra text search, e.g. loan purpose */
  text?: { label: string; placeholder: string }
  resultCount?: number
}

/** Filter bar for the community tabs: member, date range (NPT) and more. */
export function CommunityFilters({ values, onChange, choice, text, resultCount }: Props) {
  const set = (patch: Partial<CommunityFilterValues>) => onChange({ ...values, ...patch })
  const active = [values.member, values.dateFrom, values.dateTo, values.choice, values.text].filter(Boolean).length

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          {t("Filters")}{active > 0 && <span className="rounded-full bg-primary/10 px-1.5 text-[10px] font-semibold text-primary">{n(active)}</span>}
          {resultCount !== undefined && <span className="font-normal">{t("· {0} shown", resultCount)}</span>}
        </p>
        {active > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onChange({ member: "", dateFrom: "", dateTo: "", choice: "", text: "" })}
          >
            <X className="mr-1 h-3.5 w-3.5" /> {t(" Clear")}</Button>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cf-member" className="text-[11px] text-muted-foreground">{t("Member")}</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="cf-member"
              className="h-9 pl-8 text-sm"
              placeholder={t("Search by name")}
              value={values.member}
              onChange={(e) => set({ member: e.target.value })}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cf-from" className="text-[11px] text-muted-foreground">{t("From (NPT)")}</Label>
          <DateField id="cf-from" clearable value={values.dateFrom} max={values.dateTo || undefined} onChange={(v) => set({ dateFrom: v })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cf-to" className="text-[11px] text-muted-foreground">{t("To (NPT)")}</Label>
          <DateField id="cf-to" clearable value={values.dateTo} min={values.dateFrom || undefined} onChange={(v) => set({ dateTo: v })} />
        </div>
        {choice && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] text-muted-foreground">{t(choice.label)}</Label>
            <Select value={values.choice || "all"} onValueChange={(v) => set({ choice: v === "all" ? "" : v })}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("All")}</SelectItem>
                {choice.options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {t(o.label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {text && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cf-text" className="text-[11px] text-muted-foreground">{t(text.label)}</Label>
            <Input id="cf-text" className="h-9 text-sm" placeholder={t(text.placeholder)} value={values.text} onChange={(e) => set({ text: e.target.value })} />
          </div>
        )}
      </div>
    </div>
  )
}
