// Anrede-Segmente (design.md §4): „Herr / Frau / Divers", 56 px hoch,
// aktiv: brand-soft Fläche + brand Text + 1.5 px grüner Rahmen,
// Wechsel per layoutId-Indikator animiert (150 ms).

import { motion } from 'framer-motion'
import type { Anrede } from '@/lib/types'
import { cn } from '@/lib/utils'

const OPTIONEN: Array<{ wert: Anrede; label: string }> = [
  { wert: 'herr', label: 'Herr' },
  { wert: 'frau', label: 'Frau' },
  { wert: 'divers', label: 'Divers' },
]

interface Props {
  /** null = noch nichts gewählt (kein Segment aktiv, z. B. im leeren Formular) */
  value: Anrede | null
  onChange: (wert: Anrede) => void
  label?: string
}

export default function AnredeSegmente({ value, onChange, label = 'Anrede' }: Props) {
  return (
    <fieldset className="w-full">
      <legend className="mb-1 text-[15px] text-ink-soft">{label}</legend>
      <div className="grid h-14 grid-cols-3 gap-2" role="radiogroup" aria-label={label}>
        {OPTIONEN.map((opt) => {
          const aktiv = value === opt.wert
          return (
            <button
              key={opt.wert}
              type="button"
              role="radio"
              aria-checked={aktiv}
              onClick={() => onChange(opt.wert)}
              className={cn(
                'relative h-full rounded-xl text-[17px] font-bold transition-colors duration-150',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
                aktiv ? 'text-brand' : 'text-ink',
              )}
            >
              {aktiv && (
                <motion.span
                  layoutId="anrede-segment-aktiv"
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  className="absolute inset-0 rounded-xl border-[1.5px] border-brand bg-brand-soft"
                />
              )}
              {!aktiv && (
                <span className="absolute inset-0 rounded-xl border border-line bg-paper-raised" />
              )}
              <span className="relative">{opt.label}</span>
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}
