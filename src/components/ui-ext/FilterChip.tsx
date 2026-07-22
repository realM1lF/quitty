// Filter-Chip (design.md §4): voll rund, 40 px hoch, 1 px line-Rahmen;
// aktiv: brand-soft Fläche + brand Text + grüner Rahmen.
// Aktivierung: Farbwechsel 150 ms + kurzes scale 0.94→1.

import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  children: ReactNode
  aktiv?: boolean
  onClick?: () => void
  icon?: ReactNode
  className?: string
}

export default function FilterChip({ children, aktiv, onClick, icon, className }: Props) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      animate={aktiv ? { scale: [0.94, 1] } : { scale: 1 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className={cn(
        'flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-[15px]',
        'transition-colors duration-150',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
        aktiv
          ? 'border-brand bg-brand-soft font-bold text-brand'
          : 'border-line bg-paper-raised text-ink',
        className,
      )}
    >
      {icon}
      {children}
    </motion.button>
  )
}
