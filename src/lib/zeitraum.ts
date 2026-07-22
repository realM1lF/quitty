// QuittyPro — Zeitraum-Helfer für Export & Auswertung (leichtgewichtig,
// ohne pdfmake-Abhängigkeit, damit sie im Haupt-Bundle bleiben können).

import type { ReceiptFilter } from './types'
import { formatMonatJahr } from './format'

export type Zeitraum =
  | { typ: 'monat'; jahr: number; monat: number }
  | { typ: 'jahr'; jahr: number }

/** „Mai 2026" bzw. „2026" */
export function zeitraumLabel(z: Zeitraum): string {
  return z.typ === 'monat' ? formatMonatJahr(z.monat, z.jahr) : String(z.jahr)
}

/** „2026-05" bzw. „2026" (für Dateinamen) */
export function zeitraumSuffix(z: Zeitraum): string {
  return z.typ === 'monat' ? `${z.jahr}-${String(z.monat).padStart(2, '0')}` : String(z.jahr)
}

/** ReceiptFilter für die Datenschicht */
export function zeitraumFilter(z: Zeitraum): ReceiptFilter {
  return z.typ === 'monat' ? { jahr: z.jahr, monat: z.monat } : { jahr: z.jahr }
}

export function gleicherZeitraum(a: Zeitraum, b: Zeitraum): boolean {
  return (
    a.typ === b.typ && a.jahr === b.jahr && (a.typ === 'jahr' || a.monat === (b as { monat: number }).monat)
  )
}
