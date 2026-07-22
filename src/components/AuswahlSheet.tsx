// AuswahlSheet (neu.md §1) — Bottom Sheet nach FAB „+":
// „Quittung fotografieren" (öffnet direkt die Kamera) / „Von Hand eintragen".
// Backdrop ink 40 %, Tipp oder Drag nach unten schließt.
// Sheet: paper-raised, obere Ecken 20 px, Drag-Griff 36×4, Safe-Area unten.
// Animation: Spring hoch (stiffness 380, damping 34), Kacheln gestaffelt.

import { useRef } from 'react'
import { useNavigate } from 'react-router'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type { PanInfo } from 'framer-motion'
import { Camera, PenLine } from 'lucide-react'
import { setzeKameraFoto } from '@/lib/fotoUebergabe'

interface Props {
  offen: boolean
  onSchliessen: () => void
}

interface KachelProps {
  icon: typeof Camera
  titel: string
  untertitel: string
  verzoegerung: number
  onClick: () => void
}

function Kachel({ icon: Icon, titel, untertitel, verzoegerung, onClick }: KachelProps) {
  const reducedMotion = useReducedMotion()
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ duration: 0.18, delay: verzoegerung, ease: 'easeOut' }}
      whileTap={{ scale: 0.97 }}
      className="flex h-24 w-full items-center gap-4 rounded-2xl border border-line bg-paper px-4 text-left"
    >
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
        <Icon className="h-[26px] w-[26px]" strokeWidth={2} />
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-[18px] font-bold leading-tight text-ink">{titel}</span>
        <span className="text-[15px] leading-tight text-ink-soft">{untertitel}</span>
      </span>
    </motion.button>
  )
}

export default function AuswahlSheet({ offen, onSchliessen }: Props) {
  const navigate = useNavigate()
  const reducedMotion = useReducedMotion()
  const kameraInput = useRef<HTMLInputElement>(null)

  function handleDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.y > 90 || info.velocity.y > 500) onSchliessen()
  }

  function handleFoto(datei: File | undefined) {
    if (!datei) return
    setzeKameraFoto(datei)
    onSchliessen()
    navigate('/neu?quelle=foto')
  }

  return (
    <>
      {/* Versteckter Kamera-Input (iOS öffnet direkt die Kamera-App) */}
      <input
        ref={kameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          handleFoto(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      <AnimatePresence>
        {offen && (
          <>
            <motion.div
              key="auswahl-backdrop"
              className="fixed inset-0 z-[60] bg-ink"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={onSchliessen}
              aria-hidden="true"
            />
            <motion.div
              key="auswahl-sheet"
              role="dialog"
              aria-modal="true"
              aria-label="Neue Quittung"
              className="fixed inset-x-0 bottom-0 z-[70] rounded-t-[20px] bg-paper-raised shadow-[0_-4px_24px_rgba(34,40,31,0.14)]"
              style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={
                reducedMotion
                  ? { duration: 0.2 }
                  : { type: 'spring', stiffness: 380, damping: 34 }
              }
              drag={reducedMotion ? false : 'y'}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.6 }}
              onDragEnd={handleDragEnd}
            >
              {/* Drag-Griff */}
              <div className="flex justify-center pt-2" aria-hidden="true">
                <div className="h-1 w-9 rounded-full bg-line" />
              </div>
              <div className="flex flex-col gap-3 p-5">
                <h2 className="font-serif text-[20px] text-ink">Neue Quittung</h2>
                <Kachel
                  icon={Camera}
                  titel="Quittung fotografieren"
                  untertitel="Foto machen, Felder werden erkannt"
                  verzoegerung={0.08}
                  onClick={() => kameraInput.current?.click()}
                />
                <Kachel
                  icon={PenLine}
                  titel="Von Hand eintragen"
                  untertitel="Alles selbst ausfüllen"
                  verzoegerung={0.16}
                  onClick={() => {
                    onSchliessen()
                    navigate('/neu')
                  }}
                />
                <button
                  type="button"
                  onClick={onSchliessen}
                  className="mx-auto flex h-12 items-center justify-center px-6 text-[15px] text-ink-soft"
                >
                  Abbrechen
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
