import "patrojs/style.css"
import { getLang, t } from "@/lib/i18n"
import { useCallback, useState } from "react"
import { useTheme } from "next-themes"
import { Datepicker } from "patrojs"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { dayKey } from "@/lib/datetime"

/*
 * Date fields for the whole app (patrojs).
 *
 * Values are AD calendar days, "YYYY-MM-DD", in Nepal time, exactly like
 * <input type="date">. In Nepali the picker shows the Bikram Sambat calendar
 * (with the AD date under each day); in English the AD calendar (with BS
 * under each day). Saturday is coloured as the weekend.
 */

interface DateFieldProps {
  id?: string
  value: string
  onChange: (value: string) => void
  min?: string
  max?: string
  disabled?: boolean
  invalid?: boolean
  clearable?: boolean
  placeholder?: string
  className?: string
  "aria-label"?: string
}

export function DateField({
  id,
  value,
  onChange,
  min,
  max,
  disabled,
  invalid,
  clearable,
  placeholder,
  className,
  ...aria
}: DateFieldProps) {
  const ne = getLang() === "ne"
  const { resolvedTheme } = useTheme()
  // Inside a modal dialog the popover must render in the dialog (a modal
  // blocks clicks outside itself)
  const [dialog, setDialog] = useState<Element | null>(null)
  const ref = useCallback((el: HTMLDivElement | null) => {
    setDialog(el?.closest('[role="dialog"], [role="alertdialog"]') ?? null)
  }, [])

  return (
    <div ref={ref} className={cn("min-w-0", className)}>
      <Datepicker
        id={id}
        aria-label={aria["aria-label"]}
        calendar={ne ? "BS" : "AD"}
        locale={ne ? "ne" : "en"}
        numerals={ne ? "devanagari" : "latin"}
        value={value || null}
        onChange={(picked) => onChange(picked?.ad ?? "")}
        minDate={min || undefined}
        maxDate={max || undefined}
        today={dayKey(new Date())}
        weekendDays={[6]}
        showTodayButton
        clearable={clearable}
        disabled={disabled}
        invalid={invalid}
        placeholder={placeholder ?? t("Choose a date")}
        theme={resolvedTheme === "dark" ? "dark" : "light"}
        portalContainer={dialog}
        inputClassName="h-9 text-sm"
      />
    </div>
  )
}

/** Date + time in Nepal time; value like <input type="datetime-local">: "YYYY-MM-DDTHH:mm". */
export function DateTimeField({
  id,
  value,
  onChange,
  min,
  max,
  disabled,
  invalid,
  clearable,
  className,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  /** Earliest / latest date ("YYYY-MM-DD" or a datetime value; only the date part is used) */
  min?: string
  max?: string
  clearable?: boolean
  disabled?: boolean
  invalid?: boolean
  className?: string
}) {
  const date = value.slice(0, 10)
  const time = value.slice(11, 16) || "10:00"
  return (
    <div className={cn("flex gap-2", className)}>
      <DateField
        id={id}
        className="flex-1"
        value={date}
        min={min?.slice(0, 10)}
        max={max?.slice(0, 10)}
        clearable={clearable}
        disabled={disabled}
        invalid={invalid}
        onChange={(d) => onChange(d ? `${d}T${time}` : "")}
      />
      <Input
        type="time"
        aria-label={t("Time")}
        className="h-9 w-[6.5rem] shrink-0 text-sm"
        value={time}
        disabled={disabled || !date}
        onChange={(e) => date && e.target.value && onChange(`${date}T${e.target.value}`)}
      />
    </div>
  )
}
