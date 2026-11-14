import { t } from "@/lib/i18n"
import { useState } from "react"
import { toast } from "sonner"
import { apiError } from "@/components/policies/signing"
import { joinMeeting, type CalendarItem, type JoinInfo } from "./calendar"
import { MeetingRoom } from "./MeetingRoom"

/** join(item) asks the server for a meeting token and opens the meeting. */
export function useJoinMeeting() {
  const [info, setInfo] = useState<JoinInfo | null>(null)
  const [joiningId, setJoiningId] = useState<string | null>(null)

  const join = async (item: CalendarItem) => {
    setJoiningId(item.id)
    try {
      setInfo(await joinMeeting(item))
    } catch (err) {
      toast.error(apiError(err, t("Couldn't join the meeting.")))
    } finally {
      setJoiningId(null)
    }
  }

  const room = info ? <MeetingRoom info={info} onClose={() => setInfo(null)} /> : null
  return { join, joiningId, room }
}
