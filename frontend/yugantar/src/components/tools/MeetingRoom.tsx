import { t } from "@/lib/i18n"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Loader2, PhoneOff, Video } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatTime } from "@/lib/datetime"
import type { JoinInfo } from "./calendar"

/*
 * An online meeting inside the app (Jitsi as a Service, 8x8.vc).
 *
 * The backend gives a one-person token for this one room; the Jitsi script is
 * loaded from 8x8 only when someone joins (nothing is loaded otherwise).
 */

interface JitsiApi {
  addListener: (event: string, fn: () => void) => void
  dispose: () => void
}
type JitsiCtor = new (domain: string, options: Record<string, unknown>) => JitsiApi

declare global {
  interface Window {
    JitsiMeetExternalAPI?: JitsiCtor
  }
}

const scripts = new Map<string, Promise<void>>()

function loadScript(src: string): Promise<void> {
  if (window.JitsiMeetExternalAPI) return Promise.resolve()
  let p = scripts.get(src)
  if (!p) {
    p = new Promise<void>((resolve, reject) => {
      const el = document.createElement("script")
      el.src = src
      el.async = true
      el.onload = () => resolve()
      el.onerror = () => {
        scripts.delete(src)
        el.remove()
        reject(new Error("load failed"))
      }
      document.head.appendChild(el)
    })
    scripts.set(src, p)
  }
  return p
}

export function MeetingRoom({ info, onClose }: { info: JoinInfo; onClose: () => void }) {
  const container = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    let api: JitsiApi | null = null
    let disposed = false
    const appId = info.room.split("/")[0]
    loadScript(`https://${info.domain}/${appId}/external_api.js`)
      .then(() => {
        if (disposed || !container.current || !window.JitsiMeetExternalAPI) return
        api = new window.JitsiMeetExternalAPI(info.domain, {
          roomName: info.room,
          jwt: info.jwt,
          parentNode: container.current,
          width: "100%",
          height: "100%",
          userInfo: { displayName: info.display_name },
          configOverwrite: {
            subject: info.title,
            prejoinPageEnabled: true, // check camera / microphone first
            disableDeepLinking: true, // stay in the browser on phones
            startWithAudioMuted: true,
            hideConferenceSubject: false,
          },
          interfaceConfigOverwrite: {
            MOBILE_APP_PROMO: false,
            SHOW_CHROME_EXTENSION_BANNER: false,
          },
        })
        api.addListener("videoConferenceJoined", () => setStatus("ready"))
        api.addListener("readyToClose", () => closeRef.current())
        setStatus("ready")
      })
      .catch(() => !disposed && setStatus("error"))
    return () => {
      disposed = true
      api?.dispose()
    }
  }, [info])

  // Esc doesn't close (it's used inside the meeting); the Leave button does
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-neutral-950 text-white"
      role="dialog"
      aria-label={info.title}
    >
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-white/10 px-3 sm:px-4">
        <Video className="h-4 w-4 shrink-0 text-sky-400" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{info.title}</p>
          <p className="truncate text-[11px] text-white/60">
            {info.moderator ? t("You are a host") : t("Participant")} ·{" "}
            {t("Scheduled to end at {0}", formatTime(info.ends_at))}
          </p>
        </div>
        <Button size="sm" variant="destructive" onClick={onClose} className="shrink-0">
          <PhoneOff className="mr-1.5 h-4 w-4" />
          {t("Leave")}
        </Button>
      </div>
      <div className="relative flex-1">
        <div ref={container} className="absolute inset-0" />
        {status === "loading" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/70">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-sm">{t("Connecting to the meeting…")}</p>
          </div>
        )}
        {status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-sm text-white/80">
              {t("Couldn't load the meeting. Check your internet connection and try again.")}
            </p>
            <Button variant="secondary" size="sm" onClick={onClose}>
              {t("Close")}
            </Button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
