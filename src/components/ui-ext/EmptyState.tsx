// Leerer Zustand (liste.md §2): empty-state.svg, Fraunces-Titel, Erklärtext,
// optional ein Aktions-Button (z. B. „Filter zurücksetzen").

import type { ReactNode } from 'react'
import { motion } from 'framer-motion'

interface Props {
  titel: string
  text: string
  /** optionaler Aktions-Bereich unter dem Text (z. B. Sekundär-Button) */
  aktion?: ReactNode
}

export default function EmptyState({ titel, text, aktion }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: 'easeOut' }}
      className="flex flex-col items-center justify-center px-8 py-16 text-center"
    >
      <img src="/empty-state.svg" alt="" width={240} height={180} className="mb-6" />
      <h2 className="font-serif text-[20px] text-ink">{titel}</h2>
      <p className="mt-2 max-w-[300px] text-[17px] text-ink-soft">{text}</p>
      {aktion && <div className="mt-6 w-full max-w-[280px]">{aktion}</div>}
    </motion.div>
  )
}
