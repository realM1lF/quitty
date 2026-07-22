// Stempel-Overlay „Eingetragen" (design.md §2.5 — Signatur-Moment):
// Caveat-Schriftzug + handgezeichneter Oval-Ring in brand-green, um −8° rotiert.
// Eintritt: scale 1.5→1, opacity 0→1, rotate −14°→−8°, Spring (stiffness 500, damping 17),
// Ring zeichnet sich nach (pathLength 0→1, 350 ms, 60 ms verzögert).
// Nach 700 ms Standzeit ruft er onFertig() (→ Navigation zur Liste).
// Reduced Motion: erscheint ohne Sprung.

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useEffect } from 'react'

interface Props {
  sichtbar: boolean
  /** Wird nach Eintritt + 700 ms Standzeit aufgerufen (z. B. navigate('/')) */
  onFertig?: () => void
}

export default function StampOverlay({ sichtbar, onFertig }: Props) {
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    if (!sichtbar || !onFertig) return
    const t = setTimeout(onFertig, reducedMotion ? 900 : 1100)
    return () => clearTimeout(t)
  }, [sichtbar, onFertig, reducedMotion])

  return (
    <AnimatePresence>
      {sichtbar && (
        <motion.div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-paper/80"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          aria-live="polite"
          aria-label="Eingetragen"
        >
          <motion.div
            initial={
              reducedMotion
                ? { opacity: 0, rotate: -8, scale: 1 }
                : { opacity: 0, scale: 1.5, rotate: -14 }
            }
            animate={{ opacity: 1, scale: 1, rotate: -8 }}
            transition={
              reducedMotion
                ? { duration: 0.2 }
                : { type: 'spring', stiffness: 500, damping: 17 }
            }
            className="relative flex items-center justify-center"
          >
            {/* Handgezeichneter, leicht unregelmäßiger Doppel-Oval-Ring */}
            <svg
              width="320"
              height="160"
              viewBox="0 0 320 160"
              fill="none"
              className="absolute"
              aria-hidden="true"
            >
              <motion.path
                d="M 30 84
                   C 26 50, 82 26, 160 24
                   C 238 22, 296 44, 292 80
                   C 288 116, 230 138, 158 138
                   C 86 138, 34 118, 30 84 Z"
                stroke="#1E5B43"
                strokeWidth="3.5"
                strokeLinecap="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={
                  reducedMotion
                    ? { duration: 0.01 }
                    : { duration: 0.35, delay: 0.06, ease: 'easeOut' }
                }
              />
              <motion.path
                d="M 42 82
                   C 40 56, 90 36, 160 35
                   C 230 34, 280 52, 278 80
                   C 276 108, 224 127, 158 127
                   C 94 127, 44 110, 42 82 Z"
                stroke="#1E5B43"
                strokeWidth="2"
                strokeLinecap="round"
                opacity="0.6"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={
                  reducedMotion
                    ? { duration: 0.01 }
                    : { duration: 0.35, delay: 0.12, ease: 'easeOut' }
                }
              />
            </svg>
            <span className="relative font-hand text-[44px] leading-none text-brand">
              Eingetragen
            </span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
