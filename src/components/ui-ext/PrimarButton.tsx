// Primär-Button (design.md §4): 56 px, Radius 12, brand-Fläche, weißer Text 17 bold,
// volle Breite auf Mobile, disabled 40 % Opacity, whileTap scale 0.97.

import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  children: ReactNode
  onClick?: () => void
  type?: 'button' | 'submit'
  disabled?: boolean
  loading?: boolean
  icon?: ReactNode
  className?: string
}

export default function PrimarButton({
  children,
  onClick,
  type = 'button',
  disabled,
  loading,
  icon,
  className,
}: Props) {
  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      whileTap={{ scale: 0.97 }}
      className={cn(
        'flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-brand px-6',
        'text-[17px] font-bold text-white transition-opacity duration-150',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
        (disabled || loading) && 'opacity-40',
        className,
      )}
    >
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : icon}
      {children}
    </motion.button>
  )
}
