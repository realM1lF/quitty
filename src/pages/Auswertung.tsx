// Auswertung — Route `/auswertung` (Spec: design/auswertung.md).
// Monats-/Jahresübersicht: Umsatz, Aufträge, km, km-Wert als ruhige Zahlen-Kacheln
// (eine pro Zeile, Desktop 2×2) + einfache horizontale Balken (Umsatz, Kilometer).
// Zeitraum-Wähler: Segmente „Monat | Jahr" + Stepper (Zukunft gesperrt) +
// Titel-Tap → Bottom-Sheet-Schnellauswahl. Drill-down: Jahres-Balken → Monat.
// Zahlen: Count-up 600 ms; Balken wachsen per scaleX beim Reinscrollen.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { getISOWeek } from 'date-fns'
import { Check, ChevronLeft, ChevronRight, FileDown, X } from 'lucide-react'
import { getSettings, listReceipts } from '@/lib/db'
import type { Receipt } from '@/lib/types'
import { formatEUR, formatKm, formatMonatJahr, formatPauschale, parseDatum } from '@/lib/format'
import { SekundarButton } from '@/components/ui-ext'
import { useWeicheZahl } from '@/hooks/use-weiche-zahl'
import { cn } from '@/lib/utils'

type Modus = 'monat' | 'jahr'

const MONATE_KURZ = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

/** 412.34 → „412 €" (Balken-Werte ohne Nachkommastellen) */
function formatEurKurz(v: number): string {
  return `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(Math.round(v))} €`
}

function kmHinRueck(r: Receipt): number {
  return (r.km_einfach ?? 0) * 2
}

function istGeschaetzt(r: Receipt): boolean {
  return r.km_quelle === 'ort' && !r.km_manuell
}

// ---------- Horizontales Balken-Diagramm ----------

interface BalkenZeile {
  schluessel: string
  label: string
  wert: number
  /** Gestapeltes ochre-Segment am Balkenende (geschätzte km) */
  geschaetzt?: number
  /** Dünner Vorjahr-Balken (8 px) über dem Hauptbalken */
  vorjahr?: number
  /** Aktueller Zeitraum → voller Ton, andere 55 % */
  aktuell: boolean
  onClick?: () => void
}

interface BalkenDiagrammProps {
  titel: string
  legende?: React.ReactNode
  zeilen: BalkenZeile[]
  max: number
  formatWert: (v: number) => string
  /** z. B. 'bg-brand' oder 'bg-brand/70' (km-Diagramm) */
  balkenKlasse?: string
}

function BalkenDiagramm({
  titel,
  legende,
  zeilen,
  max,
  formatWert,
  balkenKlasse = 'bg-brand',
}: BalkenDiagrammProps) {
  const reduced = useReducedMotion()
  const irgendAktuell = zeilen.some((z) => z.aktuell)
  const pct = (v: number) => (max > 0 ? Math.max(0, Math.min(100, (v / max) * 100)) : 0)

  const wachsen = (i: number) =>
    reduced
      ? {}
      : {
          initial: { scaleX: 0 },
          whileInView: { scaleX: 1 },
          viewport: { once: true, amount: 0.2 },
          transition: { duration: 0.5, ease: 'easeOut' as const, delay: i * 0.08 },
        }

  return (
    <section className="pr-14">
      <h2 className="font-serif text-[19px] text-ink">{titel}</h2>
      {legende}
      <div className="mt-3 space-y-3">
        {zeilen.map((z, i) => {
          const gesamtPct = pct(z.wert)
          const geschAnteil = z.geschaetzt != null && z.wert > 0 ? z.geschaetzt / z.wert : 0
          const inhalt = (
            <>
              {z.vorjahr != null && (
                <div className="flex items-end">
                  <span className="w-16 shrink-0" aria-hidden="true" />
                  <div className="flex-1 border-l border-line">
                    <motion.div
                      className="h-2 rounded-r-[4px] bg-ochre"
                      style={{ width: `${pct(z.vorjahr)}%`, transformOrigin: 'left' }}
                      {...wachsen(i)}
                    />
                  </div>
                </div>
              )}
              <div className="flex items-center">
                <span className="w-16 shrink-0 text-[15px] text-ink-soft">{z.label}</span>
                <div className="relative h-5 flex-1 border-l border-line">
                  <motion.div
                    className={cn(
                      'flex h-5 overflow-hidden rounded-r-[4px]',
                      irgendAktuell && !z.aktuell && 'opacity-[0.55]',
                    )}
                    style={{ width: `${gesamtPct}%`, transformOrigin: 'left' }}
                    {...wachsen(i)}
                  >
                    <div
                      className={cn('h-full', balkenKlasse)}
                      style={{ width: `${(1 - geschAnteil) * 100}%` }}
                    />
                    {geschAnteil > 0 && (
                      <div className="h-full bg-ochre" style={{ width: `${geschAnteil * 100}%` }} />
                    )}
                  </motion.div>
                  <span
                    className="tabular absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-[13px] text-ink"
                    style={{ left: `calc(${gesamtPct}% + 8px)` }}
                  >
                    {formatWert(z.wert)}
                  </span>
                </div>
              </div>
            </>
          )
          return z.onClick ? (
            <motion.button
              key={z.schluessel}
              type="button"
              onClick={z.onClick}
              whileTap={{ scale: 0.98 }}
              className="block w-full text-left"
              aria-label={`${z.label}: ${formatWert(z.wert)} — Monat öffnen`}
            >
              {inhalt}
            </motion.button>
          ) : (
            <div key={z.schluessel}>{inhalt}</div>
          )
        })}
      </div>
    </section>
  )
}

// ---------- Legende (13 px, Farbpunkte) ----------

function Legende({ eintraege }: { eintraege: Array<{ farbe: string; label: string }> }) {
  return (
    <p className="mt-1 flex items-center gap-4 text-[13px] text-ink-soft">
      {eintraege.map((e) => (
        <span key={e.label} className="flex items-center gap-1.5">
          <span className={cn('h-2 w-2 rounded-full', e.farbe)} aria-hidden="true" />
          {e.label}
        </span>
      ))}
    </p>
  )
}

// ---------- Zahlen-Kachel (88 px, Count-up) ----------

interface KachelProps {
  label: string
  wert: number
  formatWert: (v: number) => string
  kontext?: React.ReactNode
  /** Index für Mount-Stagger + gekoppelten Count-up-Start */
  index: number
  /** z. B. text-ochre für den km-Wert */
  wertKlasse?: string
}

function Kachel({ label, wert, formatWert, kontext, index, wertKlasse }: KachelProps) {
  const reduced = useReducedMotion()
  const gezaehlt = useWeicheZahl(wert, 0.6, index * 0.07)
  return (
    <motion.div
      initial={{ opacity: 0, y: reduced ? 0 : 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut', delay: index * 0.07 }}
      className="flex h-[88px] items-center justify-between gap-3 rounded-xl border border-line bg-paper-raised px-4"
    >
      <div className="min-w-0">
        <p className="text-[15px] text-ink-soft">{label}</p>
        <p className={cn('tabular truncate text-[26px] font-bold leading-tight text-ink', wertKlasse)}>
          {formatWert(gezaehlt)}
        </p>
      </div>
      {kontext && (
        <div className="flex shrink-0 flex-col items-end gap-0.5 text-right text-[13px] text-ink-soft">
          {kontext}
        </div>
      )}
    </motion.div>
  )
}

// ---------- Bottom-Sheet Schnellauswahl ----------

interface SheetProps {
  titel: string
  offen: boolean
  onSchliessen: () => void
  optionen: Array<{ schluessel: string; label: string; aktiv: boolean; onClick: () => void }>
}

function SchnellauswahlSheet({ titel, offen, onSchliessen, optionen }: SheetProps) {
  return (
    <AnimatePresence>
      {offen && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-end justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="absolute inset-0 bg-ink/40" onClick={onSchliessen} aria-hidden="true" />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={titel}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            className="pb-safe relative max-h-[70dvh] w-full max-w-[520px] overflow-y-auto rounded-t-2xl bg-paper-raised shadow-sheet"
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-line bg-paper-raised px-5 py-3">
              <h2 className="font-serif text-[19px] text-ink">{titel}</h2>
              <button
                type="button"
                onClick={onSchliessen}
                aria-label="Schließen"
                className="flex h-12 w-12 items-center justify-center text-ink-soft"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-2 py-2">
              {optionen.length === 0 ? (
                <p className="px-4 py-6 text-center text-[15px] text-ink-soft">
                  Noch keine Einträge vorhanden.
                </p>
              ) : (
                optionen.map((o) => (
                  <button
                    key={o.schluessel}
                    type="button"
                    onClick={o.onClick}
                    className={cn(
                      'flex h-14 w-full items-center justify-between rounded-xl px-4 text-left text-[17px]',
                      o.aktiv ? 'bg-brand-soft font-bold text-brand' : 'text-ink',
                    )}
                  >
                    <span>{o.label}</span>
                    {o.aktiv && <Check className="h-5 w-5 text-brand" />}
                  </button>
                ))
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ---------- Seite ----------

export default function Auswertung() {
  const navigate = useNavigate()
  const reduced = useReducedMotion()
  const jetzt = new Date()
  const jahrJetzt = jetzt.getFullYear()
  const monatJetzt = jetzt.getMonth() + 1
  const kwJetzt = getISOWeek(jetzt)

  const [alle, setAlle] = useState<Receipt[] | null>(null)
  const [pauschale, setPauschale] = useState(0.3)
  const [modus, setModus] = useState<Modus>('monat')
  const [jahr, setJahr] = useState(jahrJetzt)
  const [monat, setMonat] = useState(monatJetzt)
  const [sheetOffen, setSheetOffen] = useState(false)

  useEffect(() => {
    listReceipts()
      .then(setAlle)
      .catch(() => setAlle([]))
    getSettings()
      .then((s) => {
        if (s) setPauschale(s.km_pauschale)
      })
      .catch(() => {})
  }, [])

  const istAktuell =
    modus === 'monat' ? jahr === jahrJetzt && monat === monatJetzt : jahr === jahrJetzt

  // Vorperiode: Vormonat (mit Jahreswechsel) bzw. Vorjahr
  const [vJahr, vMonat] =
    modus === 'monat' ? (monat === 1 ? [jahr - 1, 12] : [jahr, monat - 1]) : [jahr - 1, 0]

  const eintraege = useMemo(
    () =>
      (alle ?? []).filter((r) => {
        const j = Number(r.datum.slice(0, 4))
        const m = Number(r.datum.slice(5, 7))
        return modus === 'monat' ? j === jahr && m === monat : j === jahr
      }),
    [alle, modus, jahr, monat],
  )

  const vorEintraege = useMemo(
    () =>
      (alle ?? []).filter((r) => {
        const j = Number(r.datum.slice(0, 4))
        const m = Number(r.datum.slice(5, 7))
        return modus === 'monat' ? j === vJahr && m === vMonat : j === vJahr
      }),
    [alle, modus, vJahr, vMonat],
  )

  // Kennzahlen (Daten-Regeln §5: km-Wert = Σ(km_einfach × 2) × Pauschale)
  const umsatz = eintraege.reduce((s, r) => s + r.betrag, 0)
  const auftraege = eintraege.length
  const kmGesamt = eintraege.reduce((s, r) => s + kmHinRueck(r), 0)
  const kmGeschaetzt = eintraege.reduce((s, r) => s + (istGeschaetzt(r) ? kmHinRueck(r) : 0), 0)
  const kmWert = kmGesamt * pauschale
  const vorUmsatz = vorEintraege.reduce((s, r) => s + r.betrag, 0)
  const vergleich = vorEintraege.length > 0 && vorUmsatz > 0 ? (umsatz - vorUmsatz) / vorUmsatz : null

  // Balken-Daten: Jahres-Modus = 12 Monate (mit Vorjahr), Monats-Modus = Wochen mit Einträgen
  const umsatzZeilen = useMemo((): BalkenZeile[] => {
    if (modus === 'jahr') {
      return Array.from({ length: 12 }, (_, i) => {
        const m = i + 1
        const wert = eintraege
          .filter((r) => Number(r.datum.slice(5, 7)) === m)
          .reduce((s, r) => s + r.betrag, 0)
        const vor = vorEintraege
          .filter((r) => Number(r.datum.slice(5, 7)) === m)
          .reduce((s, r) => s + r.betrag, 0)
        return {
          schluessel: `m${m}`,
          label: MONATE_KURZ[i],
          wert,
          vorjahr: vor,
          aktuell: jahr === jahrJetzt && m === monatJetzt,
          // Drill-down: Balken tippen → Monats-Modus dieses Monats
          onClick: () => {
            setMonat(m)
            setModus('monat')
          },
        }
      })
    }
    const gruppen = new Map<number, { kw: number; rows: Receipt[]; erstes: string }>()
    for (const r of eintraege) {
      const kw = getISOWeek(parseDatum(r.datum))
      const g = gruppen.get(kw) ?? { kw, rows: [], erstes: r.datum }
      g.rows.push(r)
      if (r.datum < g.erstes) g.erstes = r.datum
      gruppen.set(kw, g)
    }
    return Array.from(gruppen.values())
      .sort((a, b) => (a.erstes < b.erstes ? -1 : 1))
      .map((g) => ({
        schluessel: `kw${g.kw}`,
        label: `KW ${g.kw}`,
        wert: g.rows.reduce((s, r) => s + r.betrag, 0),
        aktuell: istAktuell && g.kw === kwJetzt,
      }))
  }, [eintraege, vorEintraege, modus, jahr, jahrJetzt, monatJetzt, istAktuell, kwJetzt])

  const kmZeilen = useMemo((): BalkenZeile[] => {
    if (modus === 'jahr') {
      return Array.from({ length: 12 }, (_, i) => {
        const m = i + 1
        const rows = eintraege.filter((r) => Number(r.datum.slice(5, 7)) === m)
        return {
          schluessel: `km${m}`,
          label: MONATE_KURZ[i],
          wert: rows.reduce((s, r) => s + kmHinRueck(r), 0),
          geschaetzt: rows.reduce((s, r) => s + (istGeschaetzt(r) ? kmHinRueck(r) : 0), 0),
          aktuell: jahr === jahrJetzt && m === monatJetzt,
          onClick: () => {
            setMonat(m)
            setModus('monat')
          },
        }
      })
    }
    const gruppen = new Map<number, { kw: number; rows: Receipt[]; erstes: string }>()
    for (const r of eintraege) {
      const kw = getISOWeek(parseDatum(r.datum))
      const g = gruppen.get(kw) ?? { kw, rows: [], erstes: r.datum }
      g.rows.push(r)
      if (r.datum < g.erstes) g.erstes = r.datum
      gruppen.set(kw, g)
    }
    return Array.from(gruppen.values())
      .sort((a, b) => (a.erstes < b.erstes ? -1 : 1))
      .map((g) => ({
        schluessel: `km-kw${g.kw}`,
        label: `KW ${g.kw}`,
        wert: g.rows.reduce((s, r) => s + kmHinRueck(r), 0),
        geschaetzt: g.rows.reduce((s, r) => s + (istGeschaetzt(r) ? kmHinRueck(r) : 0), 0),
        aktuell: istAktuell && g.kw === kwJetzt,
      }))
  }, [eintraege, modus, jahr, jahrJetzt, monatJetzt, istAktuell, kwJetzt])

  const hatVorjahr = modus === 'jahr' && umsatzZeilen.some((z) => (z.vorjahr ?? 0) > 0)
  const maxUmsatz = Math.max(
    0,
    ...umsatzZeilen.map((z) => Math.max(z.wert, z.vorjahr ?? 0)),
  )
  const maxKm = Math.max(0, ...kmZeilen.map((z) => z.wert))

  // Schnellauswahl: Monate/Jahre mit Einträgen
  const sheetOptionen = useMemo(() => {
    const rows = alle ?? []
    if (modus === 'jahr') {
      const jahre = Array.from(new Set(rows.map((r) => Number(r.datum.slice(0, 4))))).sort(
        (a, b) => b - a,
      )
      return jahre.map((j) => ({
        schluessel: `j${j}`,
        label: String(j),
        aktiv: j === jahr,
        onClick: () => {
          setJahr(j)
          setSheetOffen(false)
        },
      }))
    }
    const paare = new Map<string, { j: number; m: number }>()
    for (const r of rows) {
      const j = Number(r.datum.slice(0, 4))
      const m = Number(r.datum.slice(5, 7))
      paare.set(`${j}-${String(m).padStart(2, '0')}`, { j, m })
    }
    return Array.from(paare.values())
      .sort((a, b) => (a.j !== b.j ? b.j - a.j : b.m - a.m))
      .map(({ j, m }) => ({
        schluessel: `${j}-${m}`,
        label: formatMonatJahr(m, j),
        aktiv: j === jahr && m === monat,
        onClick: () => {
          setJahr(j)
          setMonat(m)
          setSheetOffen(false)
        },
      }))
  }, [alle, modus, jahr, monat])

  function zurueck() {
    if (modus === 'monat') {
      if (monat === 1) {
        setMonat(12)
        setJahr(jahr - 1)
      } else setMonat(monat - 1)
    } else setJahr(jahr - 1)
  }

  function vor() {
    if (istAktuell) return // Zukunft gesperrt
    if (modus === 'monat') {
      if (monat === 12) {
        setMonat(1)
        setJahr(jahr + 1)
      } else setMonat(monat + 1)
    } else setJahr(jahr + 1)
  }

  const titel = modus === 'monat' ? formatMonatJahr(monat, jahr) : String(jahr)
  const umsatzDiagrammTitel = modus === 'monat' ? 'Umsatz nach Woche' : 'Umsatz nach Monat'
  const kmDiagrammTitel = modus === 'monat' ? 'Kilometer nach Woche' : 'Kilometer nach Monat'

  const vergleichText =
    vergleich == null
      ? '—'
      : vergleich === 0
        ? `±0 % zum ${modus === 'monat' ? 'Vormonat' : 'Vorjahr'}`
        : `${vergleich > 0 ? '+' : '−'}${Math.abs(Math.round(vergleich * 100))} % zum ${
            modus === 'monat' ? 'Vormonat' : 'Vorjahr'
          }`

  // Lade-Zustand
  if (alle === null) {
    return (
      <div className="flex justify-center py-24" aria-label="Auswertung wird geladen">
        <motion.span
          className="h-2 w-24 rounded-full bg-brand"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1, repeat: Infinity }}
        />
      </div>
    )
  }

  return (
    <div className="px-5 pt-4 lg:px-0 lg:pt-8">
      {/* Zeitraum-Wähler */}
      <motion.div
        initial={{ opacity: 0, y: reduced ? 0 : -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: 'easeOut' }}
      >
        {/* Segmente „Monat | Jahr" (Mechanik wie Anrede-Segmente) */}
        <div className="grid h-12 grid-cols-2 gap-2" role="tablist" aria-label="Zeitraum-Art">
          {(
            [
              { wert: 'monat' as Modus, label: 'Monat' },
              { wert: 'jahr' as Modus, label: 'Jahr' },
            ]
          ).map((opt) => {
            const aktiv = modus === opt.wert
            return (
              <button
                key={opt.wert}
                type="button"
                role="tab"
                aria-selected={aktiv}
                onClick={() => setModus(opt.wert)}
                className={cn(
                  'relative h-full rounded-xl text-[17px] font-bold transition-colors duration-150',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
                  aktiv ? 'text-brand' : 'text-ink',
                )}
              >
                {aktiv && (
                  <motion.span
                    layoutId="auswertung-segment-aktiv"
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

        {/* Stepper-Zeile */}
        <div className="mt-2 flex h-14 items-center justify-between">
          <motion.button
            type="button"
            whileTap={{ scale: 0.9 }}
            onClick={zurueck}
            aria-label={modus === 'monat' ? 'Voriger Monat' : 'Voriges Jahr'}
            className="flex h-12 w-12 items-center justify-center text-ink"
          >
            <ChevronLeft className="h-6 w-6" strokeWidth={2} />
          </motion.button>
          <button
            type="button"
            onClick={() => setSheetOffen(true)}
            aria-label="Zeitraum wählen"
            className="flex h-12 items-center px-3"
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={titel}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="font-serif text-[20px] text-ink"
              >
                {titel}
              </motion.span>
            </AnimatePresence>
          </button>
          <motion.button
            type="button"
            whileTap={{ scale: 0.9 }}
            onClick={vor}
            disabled={istAktuell}
            aria-label={modus === 'monat' ? 'Nächster Monat' : 'Nächstes Jahr'}
            className={cn(
              'flex h-12 w-12 items-center justify-center text-ink',
              istAktuell && 'opacity-40',
            )}
          >
            <ChevronRight className="h-6 w-6" strokeWidth={2} />
          </motion.button>
        </div>
      </motion.div>

      {/* Inhalt — fadet beim Zeitraumwechsel, animiert neu */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${modus}-${jahr}-${monat}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {eintraege.length === 0 ? (
            /* Leerer Zeitraum */
            <div className="flex flex-col items-center px-8 py-16 text-center">
              <img src="/empty-state.svg" alt="" width={200} height={150} className="mb-6" />
              <h2 className="font-serif text-[19px] text-ink">
                Keine Einträge im {modus === 'monat' ? titel : `Jahr ${jahr}`}
              </h2>
              <p className="mt-2 max-w-[320px] text-[15px] text-ink-soft">
                Wähle oben einen anderen Zeitraum oder trage eine Quittung ein.
              </p>
            </div>
          ) : (
            <>
              {/* Vier Zahlen-Kacheln (Mobile: eine pro Zeile, Desktop: 2×2) */}
              <div className="mt-4 flex flex-col gap-3 lg:grid lg:grid-cols-2">
                <Kachel
                  label="Umsatz"
                  wert={umsatz}
                  formatWert={formatEUR}
                  index={0}
                  kontext={
                    <span className={cn(vergleich != null && vergleich > 0 && 'font-bold text-brand')}>
                      {vergleichText}
                    </span>
                  }
                />
                <Kachel
                  label="Aufträge"
                  wert={auftraege}
                  formatWert={(v) =>
                    new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(v)
                  }
                  index={1}
                  kontext={
                    <span className="tabular">Ø {formatEUR(umsatz / auftraege)} pro Auftrag</span>
                  }
                />
                <Kachel
                  label="Kilometer"
                  wert={kmGesamt}
                  formatWert={formatKm}
                  index={2}
                  kontext={
                    <>
                      <span>Hin- + Rückfahrt</span>
                      {kmGeschaetzt > 0 && (
                        <span className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-ochre" aria-hidden="true" />
                          <span className="tabular">~ {formatKm(kmGeschaetzt)} davon geschätzt</span>
                        </span>
                      )}
                    </>
                  }
                />
                <Kachel
                  label="km-Wert"
                  wert={kmWert}
                  formatWert={formatEUR}
                  index={3}
                  wertKlasse="text-ochre"
                  kontext={<span className="tabular">bei {formatPauschale(pauschale)}/km</span>}
                />
              </div>

              {/* Umsatz-Balken */}
              <div className="mt-8">
                <BalkenDiagramm
                  titel={umsatzDiagrammTitel}
                  legende={
                    hatVorjahr ? (
                      <Legende
                        eintraege={[
                          { farbe: 'bg-brand', label: String(jahr) },
                          { farbe: 'bg-ochre', label: String(jahr - 1) },
                        ]}
                      />
                    ) : undefined
                  }
                  zeilen={umsatzZeilen}
                  max={maxUmsatz}
                  formatWert={formatEurKurz}
                />
              </div>

              {/* km-Balken (gestapelt: exakt grün + geschätzt ochre) */}
              <div className="mt-8">
                <BalkenDiagramm
                  titel={kmDiagrammTitel}
                  legende={
                    <Legende
                      eintraege={[
                        { farbe: 'bg-brand', label: 'exakt' },
                        { farbe: 'bg-ochre', label: 'geschätzt' },
                      ]}
                    />
                  }
                  zeilen={kmZeilen}
                  max={maxKm}
                  formatWert={formatKm}
                  balkenKlasse="bg-brand/70"
                />
              </div>

              {/* Export-Hinweis */}
              <div className="mt-8 rounded-xl border border-line bg-paper-raised p-4">
                <p className="text-[15px] text-ink-soft">
                  Diesen Zeitraum als PDF für den Steuerberater exportieren?
                </p>
                <div className="mt-3">
                  <SekundarButton
                    onClick={() =>
                      navigate('/einstellungen#export', { state: { modus, monat, jahr } })
                    }
                    icon={<FileDown className="h-5 w-5" strokeWidth={2} />}
                  >
                    Zum Export
                  </SekundarButton>
                </div>
              </div>
            </>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Schnellauswahl (Titel-Tap) */}
      <SchnellauswahlSheet
        titel={modus === 'monat' ? 'Monat wählen' : 'Jahr wählen'}
        offen={sheetOffen}
        onSchliessen={() => setSheetOffen(false)}
        optionen={sheetOptionen}
      />
    </div>
  )
}
