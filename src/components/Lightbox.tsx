// Lightbox (neu.md §2/§3): Belegfoto groß ansehen.
// Foto max. 92 vw/vh auf ink-Backdrop, Tipp (oder X / Esc) schließt.

import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'

interface Props {
  /** Anzeigbare Bild-URL; null = geschlossen */
  quelle: string | null
  onSchliessen: () => void
  beschreibung?: string
}

export default function Lightbox({ quelle, onSchliessen, beschreibung = 'Belegfoto' }: Props) {
  useEffect(() => {
    if (!quelle) return
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onSchliessen()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [quelle, onSchliessen])

  return (
    <AnimatePresence>
      {quelle && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={beschreibung}
          className="fixed inset-0 z-[85] flex items-center justify-center bg-ink/90 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onSchliessen}
        >
          <motion.img
            src={quelle}
            alt={beschreibung}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="max-h-[92vh] max-w-[92vw] rounded-lg object-contain"
          />
          <button
            type="button"
            onClick={onSchliessen}
            aria-label="Schließen"
            className="absolute right-3 top-3 flex h-12 w-12 items-center justify-center rounded-full text-paper"
            style={{ marginTop: 'env(safe-area-inset-top)' }}
          >
            <X className="h-7 w-7" strokeWidth={2} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
