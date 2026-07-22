// Textfeld (design.md §4): 56 px, paper-raised, 1 px Rahmen line, Radius 12,
// Label 15 px ink-soft über dem Feld, Fokus 2 px brand.
// warn-Modus (unsicheres OCR-Feld): Unterrand + Hinweis „Bitte prüfen" in warn (orange, niemals rot).

import { forwardRef, useId } from 'react'
import type { InputHTMLAttributes } from 'react'
import { AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  /** true → orange „Bitte prüfen"-Markierung (z. B. unsicheres OCR-Feld) */
  warn?: boolean
  /** eigener Hinweistext unter dem Feld (statt „Bitte prüfen") */
  hinweis?: string
  containerClassName?: string
}

const TextField = forwardRef<HTMLInputElement, Props>(function TextField(
  { label, warn, hinweis, containerClassName, className, id, ...rest },
  ref,
) {
  const autoId = useId()
  const fieldId = id ?? autoId
  return (
    <div className={cn('w-full', containerClassName)}>
      <label htmlFor={fieldId} className="mb-1 block text-[15px] text-ink-soft">
        {label}
      </label>
      <input
        ref={ref}
        id={fieldId}
        {...rest}
        className={cn(
          'h-14 w-full rounded-xl border bg-paper-raised px-4 text-[17px] text-ink',
          'placeholder:text-ink-soft',
          'transition-[border-color,box-shadow] duration-150',
          'focus:outline-none focus:border-brand focus:shadow-[0_0_0_1px_#1E5B43]',
          warn
            ? 'border-warn border-b-2'
            : 'border-line',
          className,
        )}
      />
      {warn && (
        <p className="mt-1 flex items-center gap-1 text-[13px] text-warn">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {hinweis ?? 'Bitte prüfen'}
        </p>
      )}
      {!warn && hinweis && <p className="mt-1 text-[13px] text-ink-soft">{hinweis}</p>}
    </div>
  )
})

export default TextField
