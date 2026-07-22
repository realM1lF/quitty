// FotoVorbereiten (neu.md §3.1) — Vollbild-Ansicht des Belegfotos auf ink-Hintergrund.
// Aktionsleiste: Drehen (90°-Schritte), Zuschneiden (Rahmen mit 8 Griffen, freies
// Seitenverhältnis), Kontrast (Auto-Toggle, Vorschau via CSS-Filter — gebacken wird
// erst beim Export in lib/bild.ts). Drehen/Zuschneiden werden direkt ins Arbeits-Bild
// gebacken, damit sich Griffe und Vorschau immer auf dasselbe Koordinatensystem beziehen.
// Scan-State (scanAktiv): Foto bleibt sichtbar, Scanner-Balken wandert (1,6 s Loop),
// Text „Quittung wird gelesen …" + Abbrechen-Button.

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Contrast, Crop, RotateCcw, X } from 'lucide-react'
import { dreheBild, finalisiereBeleg, schneideBildZu } from '@/lib/bild'
import type { Ausschnitt } from '@/lib/bild'
import { cn } from '@/lib/utils'

interface Props {
  /** Original-Foto aus der Kamera */
  datei: Blob
  /** true = OCR läuft (Scanner-Balken + „Quittung wird gelesen …") */
  scanAktiv: boolean
  /** fertig bearbeitetes Bild (max. 1600 px, JPEG, ggf. Kontrast) */
  onWeiter: (bild: Blob) => void
  onNeuAufnehmen: () => void
  onScanAbbrechen: () => void
}

type DragModus = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'w' | 'e'

const MIN_GROESSE = 0.05
const START_AUSSCHNITT: Ausschnitt = { x: 0.06, y: 0.06, w: 0.88, h: 0.88 }

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

/** Wendet eine Drag-Bewegung (dx/dy in Bildanteilen) auf den Start-Ausschnitt an. */
function verschiebeAusschnitt(modus: DragModus, start: Ausschnitt, dx: number, dy: number): Ausschnitt {
  if (modus === 'move') {
    return {
      ...start,
      x: clamp(start.x + dx, 0, 1 - start.w),
      y: clamp(start.y + dy, 0, 1 - start.h),
    }
  }
  let { x, y, w, h } = start
  const rechts = start.x + start.w
  const unten = start.y + start.h
  if (modus.includes('w')) {
    x = clamp(start.x + dx, 0, rechts - MIN_GROESSE)
    w = rechts - x
  }
  if (modus.includes('e')) {
    w = clamp(start.w + dx, MIN_GROESSE, 1 - start.x)
  }
  if (modus.includes('n')) {
    y = clamp(start.y + dy, 0, unten - MIN_GROESSE)
    h = unten - y
  }
  if (modus.includes('s')) {
    h = clamp(start.h + dy, MIN_GROESSE, 1 - start.y)
  }
  return { x, y, w, h }
}

const GRIFFE: Array<{ modus: DragModus; klasse: string; cursor: string }> = [
  { modus: 'nw', klasse: 'left-0 top-0 -translate-x-1/2 -translate-y-1/2', cursor: 'nwse-resize' },
  { modus: 'n', klasse: 'left-1/2 top-0 -translate-x-1/2 -translate-y-1/2', cursor: 'ns-resize' },
  { modus: 'ne', klasse: 'right-0 top-0 translate-x-1/2 -translate-y-1/2', cursor: 'nesw-resize' },
  { modus: 'e', klasse: 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2', cursor: 'ew-resize' },
  { modus: 'se', klasse: 'right-0 bottom-0 translate-x-1/2 translate-y-1/2', cursor: 'nwse-resize' },
  { modus: 's', klasse: 'left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2', cursor: 'ns-resize' },
  { modus: 'sw', klasse: 'left-0 bottom-0 -translate-x-1/2 translate-y-1/2', cursor: 'nesw-resize' },
  { modus: 'w', klasse: 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2', cursor: 'ew-resize' },
]

export default function FotoVorbereiten({
  datei,
  scanAktiv,
  onWeiter,
  onNeuAufnehmen,
  onScanAbbrechen,
}: Props) {
  const [arbeitsBild, setArbeitsBild] = useState<Blob>(datei)
  const [bildUrl, setBildUrl] = useState<string | null>(null)
  const [kontrast, setKontrast] = useState(false)
  const [zuschnittAktiv, setZuschnittAktiv] = useState(false)
  const [ausschnitt, setAusschnitt] = useState<Ausschnitt>(START_AUSSCHNITT)
  const [arbeitet, setArbeitet] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const flaecheRef = useRef<HTMLDivElement>(null)

  // Object-URL des Arbeits-Bildes verwalten
  useEffect(() => {
    const url = URL.createObjectURL(arbeitsBild)
    setBildUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [arbeitsBild])

  // Nach Scan-Abbruch/-Fehler (scanAktiv → false) die Sperre wieder aufheben
  useEffect(() => {
    if (!scanAktiv) setArbeitet(false)
  }, [scanAktiv])

  const startDrag = useCallback(
    (modus: DragModus) => (e: React.PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const flaeche = flaecheRef.current
      if (!flaeche) return
      const rahmen = flaeche.getBoundingClientRect()
      if (rahmen.width === 0 || rahmen.height === 0) return
      const startX = e.clientX
      const startY = e.clientY
      const start = { ...ausschnitt }
      const onMove = (ev: PointerEvent) => {
        const dx = (ev.clientX - startX) / rahmen.width
        const dy = (ev.clientY - startY) / rahmen.height
        setAusschnitt(verschiebeAusschnitt(modus, start, dx, dy))
      }
      const onUp = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [ausschnitt],
  )

  async function mitArbeit(schritt: () => Promise<Blob>) {
    setArbeitet(true)
    setFehler(null)
    try {
      setArbeitsBild(await schritt())
    } catch {
      setFehler('Das hat nicht geklappt — bitte noch einmal versuchen.')
    } finally {
      setArbeitet(false)
    }
  }

  function drehen() {
    void mitArbeit(() => dreheBild(arbeitsBild, 90))
  }

  function zuschnittAnwenden() {
    setZuschnittAktiv(false)
    void mitArbeit(() => schneideBildZu(arbeitsBild, ausschnitt))
  }

  async function weiter() {
    setArbeitet(true)
    setFehler(null)
    try {
      onWeiter(await finalisiereBeleg(arbeitsBild, kontrast))
    } catch {
      setFehler('Das Foto konnte nicht vorbereitet werden — bitte neu aufnehmen.')
      setArbeitet(false)
    }
  }

  const gesperrt = arbeitet || scanAktiv

  return (
    <div className="fixed inset-0 z-[65] flex flex-col bg-ink">
      {/* Bildfläche */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4">
        {bildUrl && (
          <div ref={flaecheRef} className="relative max-h-full max-w-full">
            <img
              src={bildUrl}
              alt="Belegfoto"
              draggable={false}
              className="block max-h-[58vh] max-w-full select-none object-contain lg:max-h-[70vh]"
              style={
                kontrast
                  ? { filter: 'grayscale(1) contrast(1.45) brightness(1.03)' }
                  : undefined
              }
            />
            {/* Zuschnitt-Rahmen */}
            {zuschnittAktiv && !scanAktiv && (
              <div
                role="presentation"
                className="absolute touch-none border-2 border-paper shadow-[0_0_0_9999px_rgba(34,40,31,0.55)]"
                style={{
                  left: `${ausschnitt.x * 100}%`,
                  top: `${ausschnitt.y * 100}%`,
                  width: `${ausschnitt.w * 100}%`,
                  height: `${ausschnitt.h * 100}%`,
                  cursor: 'move',
                }}
                onPointerDown={startDrag('move')}
              >
                {GRIFFE.map(({ modus, klasse, cursor }) => (
                  <span
                    key={modus}
                    aria-hidden="true"
                    onPointerDown={startDrag(modus)}
                    className={cn('absolute h-6 w-6 touch-none rounded-full bg-paper', klasse)}
                    style={{ cursor }}
                  />
                ))}
              </div>
            )}
            {/* Scanner-Balken */}
            {scanAktiv && (
              <motion.div
                aria-hidden="true"
                className="absolute inset-x-0 h-0.5 bg-brand"
                initial={{ top: '0%' }}
                animate={{ top: ['0%', '100%'] }}
                transition={{ duration: 1.6, ease: 'easeInOut', repeat: Infinity, repeatType: 'reverse' }}
              />
            )}
          </div>
        )}
      </div>

      {fehler && (
        <p role="alert" className="px-5 pb-2 text-center text-[15px] text-paper">
          {fehler}
        </p>
      )}

      {scanAktiv ? (
        /* Scan-State: Text + Abbrechen */
        <div
          className="flex flex-col items-center gap-2 px-5 pb-8"
          style={{ paddingBottom: 'calc(32px + env(safe-area-inset-bottom))' }}
        >
          <p className="text-[15px] text-paper/70" aria-live="polite">
            Quittung wird gelesen …
          </p>
          <button
            type="button"
            onClick={onScanAbbrechen}
            className="flex h-12 items-center justify-center px-6 text-[15px] text-paper"
          >
            Abbrechen
          </button>
        </div>
      ) : zuschnittAktiv ? (
        /* Zuschnitt bestätigen / verwerfen */
        <div
          className="flex gap-3 px-5"
          style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}
        >
          <button
            type="button"
            onClick={() => setZuschnittAktiv(false)}
            className="flex h-14 flex-1 items-center justify-center gap-2 rounded-xl border border-paper/40 text-[17px] font-bold text-paper"
          >
            <X className="h-5 w-5" strokeWidth={2} />
            Verwerfen
          </button>
          <button
            type="button"
            onClick={zuschnittAnwenden}
            disabled={arbeitet}
            className="flex h-14 flex-1 items-center justify-center gap-2 rounded-xl bg-brand text-[17px] font-bold text-white disabled:opacity-40"
          >
            <Check className="h-5 w-5" strokeWidth={2} />
            Anwenden
          </button>
        </div>
      ) : (
        <>
          {/* Aktionsleiste: Drehen / Zuschneiden / Kontrast */}
          <motion.div
            className="flex items-stretch justify-center gap-2 px-5 pb-3"
            initial="versteckt"
            animate="sichtbar"
            variants={{ sichtbar: { transition: { staggerChildren: 0.06 } } }}
          >
            {(
              [
                { label: 'Drehen', icon: RotateCcw, onClick: drehen, aktiv: false },
                {
                  label: 'Zuschneiden',
                  icon: Crop,
                  onClick: () => {
                    setAusschnitt(START_AUSSCHNITT)
                    setZuschnittAktiv(true)
                  },
                  aktiv: false,
                },
                {
                  label: 'Kontrast',
                  icon: Contrast,
                  onClick: () => setKontrast((k) => !k),
                  aktiv: kontrast,
                },
              ] as const
            ).map(({ label, icon: Icon, onClick, aktiv }) => (
              <motion.button
                key={label}
                type="button"
                variants={{ versteckt: { opacity: 0, y: 12 }, sichtbar: { opacity: 1, y: 0 } }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                onClick={onClick}
                disabled={gesperrt}
                aria-pressed={aktiv || undefined}
                className={cn(
                  'flex h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-paper disabled:opacity-40',
                  aktiv && 'bg-brand-soft/20 text-brand-soft',
                )}
              >
                <Icon className="h-6 w-6" strokeWidth={2} />
                <span className="text-[13px]">{label}</span>
              </motion.button>
            ))}
          </motion.div>

          {/* Abschluss-Buttons */}
          <div
            className="flex gap-3 px-5"
            style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}
          >
            <button
              type="button"
              onClick={onNeuAufnehmen}
              disabled={gesperrt}
              className="flex h-14 flex-1 items-center justify-center rounded-xl border border-paper/40 text-[17px] font-bold text-paper disabled:opacity-40"
            >
              Neu aufnehmen
            </button>
            <button
              type="button"
              onClick={weiter}
              disabled={gesperrt}
              className="flex h-14 flex-1 items-center justify-center rounded-xl bg-brand text-[17px] font-bold text-white disabled:opacity-40"
            >
              {arbeitet ? 'Einen Moment …' : 'Weiter'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
