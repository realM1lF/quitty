// Bestätigungs-Dialog (design.md §4): paper-raised, Radius 16, Titel Fraunces 20,
// Buttons Primär/Sekundär, Backdrop ink 40 %. Für Gefahr-Aktionen (Löschen) mit danger-Button.

import { AnimatePresence, motion } from 'framer-motion'
import type { ReactNode } from 'react'
import PrimarButton from './PrimarButton'
import SekundarButton from './SekundarButton'
import { cn } from '@/lib/utils'

interface Props {
  offen: boolean
  titel: string
  children?: ReactNode
  bestaetigenLabel?: string
  abbrechenLabel?: string
  /** true → Bestätigen-Button in danger (z. B. Löschen) */
  gefahr?: boolean
  onBestaetigen: () => void
  onAbbrechen: () => void
}

export default function ConfirmDialog({
  offen,
  titel,
  children,
  bestaetigenLabel = 'Bestätigen',
  abbrechenLabel = 'Abbrechen',
  gefahr,
  onBestaetigen,
  onAbbrechen,
}: Props) {
  return (
    <AnimatePresence>
      {offen && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-center justify-center p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div
            className="absolute inset-0 bg-ink/40"
            onClick={onAbbrechen}
            aria-hidden="true"
          />
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-label={titel}
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 4 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="relative w-full max-w-sm rounded-2xl bg-paper-raised p-6 shadow-sheet"
          >
            <h2 className="font-serif text-[20px] text-ink">{titel}</h2>
            {children && <div className="mt-2 text-[15px] text-ink-soft">{children}</div>}
            <div className="mt-6 flex flex-col gap-3">
              {gefahr ? (
                <motion.button
                  type="button"
                  onClick={onBestaetigen}
                  whileTap={{ scale: 0.97 }}
                  className={cn(
                    'flex h-14 w-full items-center justify-center rounded-xl bg-danger px-6',
                    'text-[17px] font-bold text-white',
                  )}
                >
                  {bestaetigenLabel}
                </motion.button>
              ) : (
                <PrimarButton onClick={onBestaetigen}>{bestaetigenLabel}</PrimarButton>
              )}
              <SekundarButton onClick={onAbbrechen}>{abbrechenLabel}</SekundarButton>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
