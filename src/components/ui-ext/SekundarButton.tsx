// Sekundär-Button (design.md §4): 56 px, 1.5 px Rahmen brand, Text brand, transparent.

import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  children: ReactNode
  onClick?: () => void
  type?: 'button' | 'submit'
  disabled?: boolean
  icon?: ReactNode
  className?: string
}

export default function SekundarButton({
  children,
  onClick,
  type = 'button',
  disabled,
  icon,
  className,
}: Props) {
  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled}
      whileTap={{ scale: 0.97 }}
      className={cn(
        'flex h-14 w-full items-center justify-center gap-2 rounded-xl border-[1.5px] border-brand bg-transparent px-6',
        'text-[17px] font-bold text-brand transition-colors duration-150',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
        disabled && 'opacity-40',
        className,
      )}
    >
      {icon}
      {children}
    </motion.button>
  )
}
