// Snackbar (design.md §4): ink-Fläche, paper-Text, Radius 12, erscheint 200 ms von unten,
// autodismiss 3 s. Als Provider + Hook: const { zeigeSnackbar } = useSnackbar()

import { AnimatePresence, motion } from 'framer-motion'
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

interface SnackbarContextValue {
  zeigeSnackbar: (text: string) => void
}

const SnackbarContext = createContext<SnackbarContextValue | null>(null)

let naechsteId = 1

export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [meldung, setMeldung] = useState<{ id: number; text: string } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const zeigeSnackbar = useCallback((text: string) => {
    if (timer.current) clearTimeout(timer.current)
    setMeldung({ id: naechsteId++, text })
    timer.current = setTimeout(() => setMeldung(null), 3000)
  }, [])

  const value = useMemo(() => ({ zeigeSnackbar }), [zeigeSnackbar])

  return (
    <SnackbarContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[80] flex justify-center px-5"
        style={{ paddingBottom: 'calc(96px + env(safe-area-inset-bottom))' }}
      >
        <AnimatePresence>
          {meldung && (
            <motion.div
              key={meldung.id}
              role="status"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="rounded-xl bg-ink px-5 py-3 text-[15px] text-paper"
            >
              {meldung.text}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </SnackbarContext.Provider>
  )
}

export function useSnackbar(): SnackbarContextValue {
  const ctx = useContext(SnackbarContext)
  if (!ctx) throw new Error('useSnackbar muss innerhalb von <SnackbarProvider> verwendet werden.')
  return ctx
}
