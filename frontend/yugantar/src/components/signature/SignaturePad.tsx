import { t } from "@/lib/i18n"
import { useCallback, useEffect, useRef, useState } from "react"
import { Eraser, ImageUp, PenLine, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/*
 * Hand signature input: draw with a mouse, finger or stylus (Pointer Events,
 * so it works the same on desktop and mobile), or upload a photo/scan.
 *
 * `onChange` receives a data URL (PNG for drawings, JPEG for photos) or null
 * when cleared. The server cleans it up (transparent background, cropped).
 */

type Point = { x: number; y: number }
type Stroke = Point[]

interface Props {
  onChange: (dataUrl: string | null) => void
  className?: string
}

const INK = "#111827"
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024

export function SignaturePad({ onChange, className }: Props) {
  const [mode, setMode] = useState<"draw" | "upload">("draw")
  const [hasInk, setHasInk] = useState(false)
  const [upload, setUpload] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const strokes = useRef<Stroke[]>([])
  const current = useRef<Stroke | null>(null)
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  // Draw all strokes (in CSS pixels) onto the canvas at device resolution
  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = INK
    ctx.fillStyle = INK
    ctx.lineWidth = 2.4
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    for (const stroke of strokes.current) {
      if (stroke.length === 1) {
        ctx.beginPath()
        ctx.arc(stroke[0].x, stroke[0].y, 1.3, 0, Math.PI * 2)
        ctx.fill()
        continue
      }
      // Smooth curve through the midpoints
      ctx.beginPath()
      ctx.moveTo(stroke[0].x, stroke[0].y)
      for (let i = 1; i < stroke.length - 1; i++) {
        const mid = { x: (stroke[i].x + stroke[i + 1].x) / 2, y: (stroke[i].y + stroke[i + 1].y) / 2 }
        ctx.quadraticCurveTo(stroke[i].x, stroke[i].y, mid.x, mid.y)
      }
      const last = stroke[stroke.length - 1]
      ctx.lineTo(last.x, last.y)
      ctx.stroke()
    }
  }, [])

  // Size the canvas to its box (and again on resize / phone rotation)
  useEffect(() => {
    if (mode !== "draw") return
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const fit = () => {
      const dpr = window.devicePixelRatio || 1
      const { width, height } = wrap.getBoundingClientRect()
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      redraw()
    }
    fit()
    // Back from "Upload": report the drawing that's still there
    if (strokes.current.length) onChangeRef.current(canvas.toDataURL("image/png"))
    const observer = new ResizeObserver(fit)
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [mode, redraw])

  const emit = () => {
    const ink = strokes.current.length > 0
    setHasInk(ink)
    onChange(ink && canvasRef.current ? canvasRef.current.toDataURL("image/png") : null)
  }

  const point = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    current.current = [point(e)]
    strokes.current.push(current.current)
    redraw()
  }
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!current.current) return
    e.preventDefault()
    // Use coalesced events for smooth lines on fast finger/stylus moves
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent]
    const rect = e.currentTarget.getBoundingClientRect()
    for (const ev of events) current.current.push({ x: ev.clientX - rect.left, y: ev.clientY - rect.top })
    redraw()
  }
  const onPointerUp = () => {
    if (!current.current) return
    current.current = null
    emit()
  }

  const clear = () => {
    strokes.current = []
    redraw()
    emit()
  }
  const undo = () => {
    strokes.current.pop()
    redraw()
    emit()
  }

  const onFile = (file: File | undefined) => {
    setUploadError(null)
    if (!file) return
    if (!file.type.startsWith("image/")) return setUploadError(t("Please choose an image file."))
    if (file.size > MAX_UPLOAD_BYTES) return setUploadError(t("That image is too large (max 8 MB)."))
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      // Re-encode in the browser (any format it can show, e.g. a phone photo), max 1200 px wide
      const scale = Math.min(1, 1200 / img.naturalWidth)
      const c = document.createElement("canvas")
      c.width = Math.round(img.naturalWidth * scale)
      c.height = Math.round(img.naturalHeight * scale)
      const ctx = c.getContext("2d")!
      ctx.fillStyle = "#fff"
      ctx.fillRect(0, 0, c.width, c.height)
      ctx.drawImage(img, 0, 0, c.width, c.height)
      const dataUrl = c.toDataURL("image/jpeg", 0.9)
      URL.revokeObjectURL(url)
      setUpload(dataUrl)
      onChange(dataUrl)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      setUploadError(t("That image couldn't be opened. Try a PNG or JPEG."))
    }
    img.src = url
  }

  const switchTo = (next: "draw" | "upload") => {
    if (next === mode) return
    setMode(next)
    // Each mode keeps its own input; report the one now showing (a drawing is
    // re-reported once its canvas is back, in the sizing effect)
    onChange(next === "draw" ? null : upload)
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="inline-flex w-full rounded-lg border bg-muted/40 p-0.5 text-xs sm:w-auto sm:self-start" role="tablist">
        {(["draw", "upload"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => switchTo(m)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors sm:flex-none",
              mode === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {m === "draw" ? <PenLine className="h-3.5 w-3.5" /> : <ImageUp className="h-3.5 w-3.5" />}
            {m === "draw" ? t("Draw") : t("Upload image")}
          </button>
        ))}
      </div>

      {mode === "draw" ? (
        <>
          <div
            ref={wrapRef}
            className="relative h-44 w-full overflow-hidden rounded-lg border-2 border-dashed border-muted-foreground/30 bg-white sm:h-40"
          >
            {/* Signature line and hint (not part of the image) */}
            <div className="pointer-events-none absolute inset-x-6 bottom-9 border-b border-gray-300" />
            <span className="pointer-events-none absolute bottom-3 left-6 text-[11px] text-gray-400">
              {hasInk ? t("Signed") : t("Sign above the line with your finger, stylus or mouse")}
            </span>
            <canvas
              ref={canvasRef}
              aria-label={t("Signature drawing area")}
              className="absolute inset-0 cursor-crosshair touch-none select-none"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" className="h-9 flex-1 sm:flex-none" disabled={!hasInk} onClick={undo}>
              <Undo2 className="mr-1.5 h-4 w-4" /> {t(" Undo")}</Button>
            <Button type="button" size="sm" variant="outline" className="h-9 flex-1 sm:flex-none" disabled={!hasInk} onClick={clear}>
              <Eraser className="mr-1.5 h-4 w-4" /> {t(" Clear")}</Button>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/30 bg-white p-3 text-center text-xs text-gray-500 hover:border-primary/50">
            {upload ? (
              <img src={upload} alt={t("Your uploaded signature")} className="max-h-32 max-w-full object-contain" />
            ) : (
              <>
                <ImageUp className="h-6 w-6" />
                <span>{t("Tap to choose a photo or scan of your signature")}</span>
                <span className="text-[11px] text-gray-400">{t("Sign on plain white paper; the background is removed")}</span>
              </>
            )}
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          {upload && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9 self-start"
              onClick={() => {
                setUpload(null)
                onChange(null)
              }}
            >
              <Eraser className="mr-1.5 h-4 w-4" /> {t(" Remove image")}</Button>
          )}
          {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
        </div>
      )}
    </div>
  )
}
