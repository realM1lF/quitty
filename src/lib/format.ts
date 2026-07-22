// QuittyPro — Formatierungshelfer (Deutsch, de-DE)

import { format, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'

const eurFormatter = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** 412 → „412,00 €" */
export function formatEUR(betrag: number): string {
  return eurFormatter.format(betrag)
}

const kmFormatter = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

/** 24.8 → „24,8 km" */
export function formatKm(km: number): string {
  return `${kmFormatter.format(km)} km`
}

/** '2026-05-26' → Date (lokal, ohne Zeitzone-Verschiebung) */
export function parseDatum(datum: string): Date {
  return parseISO(datum.length === 10 ? `${datum}T00:00:00` : datum)
}

/** '2026-05-26' → „26.05." */
export function formatDatumKurz(datum: string): string {
  return format(parseDatum(datum), 'dd.MM.', { locale: de })
}

/** '2026-05-26' → „Di" */
export function formatWochentag(datum: string): string {
  return format(parseDatum(datum), 'EE', { locale: de })
}

/** '2026-05-26' → „26. Mai 2026" */
export function formatDatumLang(datum: string): string {
  return format(parseDatum(datum), 'd. MMMM yyyy', { locale: de })
}

/** 5, 2026 → „Mai 2026" */
export function formatMonatJahr(monat: number, jahr: number): string {
  return format(new Date(jahr, monat - 1, 1), 'MMMM yyyy', { locale: de })
}

/** 0.3 → „0,30 €" (km-Pauschale) */
export function formatPauschale(wert: number): string {
  return formatEUR(wert)
}
