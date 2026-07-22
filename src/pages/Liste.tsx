// Eintragsliste — Route `/` (liste.md): Paulas Kassenbuch.
// Suche (Debounce 200 ms), Filter-Chips (Monat/Jahr/Ort/nur geschätzte km),
// Monats-Kapitel mit Summen, Eintragszeilen, Desktop-Tabelle ≥ 1024 px,
// leere Zustände, gestaffelte Reveal-Animationen. Daten aus lib/db.

import { Fragment, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Check, ChevronDown, Route, Search, X } from 'lucide-react'
import { listReceipts } from '@/lib/db'
import type { Receipt } from '@/lib/types'
import {
  formatDatumKurz,
  formatEUR,
  formatKm,
  formatMonatJahr,
  formatWochentag,
} from '@/lib/format'
import { EmptyState, FilterChip, SekundarButton } from '@/components/ui-ext'
import { cn } from '@/lib/utils'

interface Filter {
  monat?: number
  jahr?: number
  ort?: string
  nurGeschaetzteKm: boolean
}

type SheetArt = 'monat' | 'jahr' | 'ort' | null

function anzeigeName(r: Receipt): string {
  const anredeKurz = r.anrede === 'herr' ? 'Hr.' : r.anrede === 'frau' ? 'Fr.' : ''
  return [anredeKurz, r.vorname, r.nachname].filter(Boolean).join(' ')
}

/** km-Anzeige: Hin + Rück (×2), Punkt grün exakt / ochre geschätzt / „…" ausstehend */
function KmAnzeige({ r, className }: { r: Receipt; className?: string }) {
  if (r.km_einfach == null) {
    return <span className={cn('text-[13px] text-ink-soft', className)}>km …</span>
  }
  const hinUndRueck = r.km_einfach * 2
  const geschaetzt = r.km_quelle === 'ort'
  return (
    <span className={cn('flex items-center justify-end gap-1.5 text-[13px] tabular', className)}>
      <span
        className={cn('h-2 w-2 rounded-full', geschaetzt ? 'bg-ochre' : 'bg-brand')}
        aria-hidden="true"
      />
      <span className={geschaetzt ? 'text-ochre' : 'text-brand'}>
        {geschaetzt ? `~ ${formatKm(hinUndRueck)}` : formatKm(hinUndRueck)}
      </span>
    </span>
  )
}

/** Auswahl-Listen-Sheet (Monat/Jahr/Ort) — Frühling hoch, Backdrop ink 40 % */
function AuswahlSheet({
  titel,
  offen,
  onSchliessen,
  children,
}: {
  titel: string
  offen: boolean
  onSchliessen: () => void
  children: React.ReactNode
}) {
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
            className="relative max-h-[70dvh] w-full max-w-[520px] overflow-y-auto rounded-t-2xl bg-paper-raised shadow-sheet pb-safe"
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
            <div className="px-2 py-2">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function SheetOption({
  label,
  detail,
  aktiv,
  onClick,
}: {
  label: string
  detail?: string
  aktiv: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-14 w-full items-center justify-between rounded-xl px-4 text-left text-[17px]',
        aktiv ? 'bg-brand-soft font-bold text-brand' : 'text-ink',
      )}
    >
      <span>{label}</span>
      <span className="flex items-center gap-2 text-[15px] text-ink-soft">
        {detail}
        {aktiv && <Check className="h-5 w-5 text-brand" />}
      </span>
    </button>
  )
}

export default function Liste() {
  const navigate = useNavigate()
  const reducedMotion = useReducedMotion()

  const [alle, setAlle] = useState<Receipt[] | null>(null)
  const [suche, setSuche] = useState('')
  const [sucheAktiv, setSucheAktiv] = useState('')
  const [filter, setFilter] = useState<Filter>({ nurGeschaetzteKm: false })
  const [sheet, setSheet] = useState<SheetArt>(null)

  useEffect(() => {
    listReceipts()
      .then(setAlle)
      .catch(() => setAlle([]))
  }, [])

  // Debounce 200 ms
  useEffect(() => {
    const t = setTimeout(() => setSucheAktiv(suche.trim().toLowerCase()), 200)
    return () => clearTimeout(t)
  }, [suche])

  const jahre = useMemo(
    () =>
      Array.from(new Set((alle ?? []).map((r) => Number(r.datum.slice(0, 4))))).sort(
        (a, b) => b - a,
      ),
    [alle],
  )

  const orte = useMemo(() => {
    const zaehler = new Map<string, number>()
    for (const r of alle ?? []) zaehler.set(r.ort, (zaehler.get(r.ort) ?? 0) + 1)
    return Array.from(zaehler.entries()).sort((a, b) => b[1] - a[1])
  }, [alle])

  const gefiltert = useMemo(() => {
    let out = alle ?? []
    if (filter.jahr) out = out.filter((r) => Number(r.datum.slice(0, 4)) === filter.jahr)
    if (filter.monat) out = out.filter((r) => Number(r.datum.slice(5, 7)) === filter.monat)
    if (filter.ort) out = out.filter((r) => r.ort === filter.ort)
    if (filter.nurGeschaetzteKm)
      out = out.filter((r) => r.km_quelle === 'ort' && !r.km_manuell)
    if (sucheAktiv) {
      out = out.filter((r) =>
        [r.vorname ?? '', r.nachname, r.ort, r.taetigkeit ?? '']
          .join(' ')
          .toLowerCase()
          .includes(sucheAktiv),
      )
    }
    return out
  }, [alle, filter, sucheAktiv])

  /** Gruppierung nach Monat, neueste zuerst */
  const kapitel = useMemo(() => {
    const gruppen = new Map<string, { monat: number; jahr: number; rows: Receipt[]; summe: number }>()
    for (const r of gefiltert) {
      const jahr = Number(r.datum.slice(0, 4))
      const monat = Number(r.datum.slice(5, 7))
      const key = `${jahr}-${String(monat).padStart(2, '0')}`
      const g = gruppen.get(key) ?? { monat, jahr, rows: [], summe: 0 }
      g.rows.push(r)
      g.summe += r.betrag
      gruppen.set(key, g)
    }
    return Array.from(gruppen.values()).sort((a, b) =>
      a.jahr !== b.jahr ? b.jahr - a.jahr : b.monat - a.monat,
    )
  }, [gefiltert])

  const summeGesamt = gefiltert.reduce((s, r) => s + r.betrag, 0)
  const filterAktiv = Boolean(filter.monat || filter.jahr || filter.ort || filter.nurGeschaetzteKm)
  const kontextZeile = [
    filter.monat && filter.jahr
      ? formatMonatJahr(filter.monat, filter.jahr)
      : filter.jahr
        ? String(filter.jahr)
        : 'Alle Einträge',
    `${gefiltert.length} Einträge`,
    formatEUR(summeGesamt),
  ].join(' · ')

  const filterSchluessel = JSON.stringify([filter, sucheAktiv])
  const jahrFuerMonate = filter.jahr ?? jahre[0] ?? new Date().getFullYear()

  function zuruecksetzen() {
    setFilter({ nurGeschaetzteKm: false })
    setSuche('')
  }

  // Lade-Zustand
  if (alle === null) {
    return (
      <div className="flex justify-center py-24" aria-label="Einträge werden geladen">
        <motion.span
          className="h-2 w-24 rounded-full bg-brand"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1, repeat: Infinity }}
        />
      </div>
    )
  }

  // Ganz leer (keine Einträge vorhanden)
  if (alle.length === 0) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center">
        <EmptyState
          titel="Noch keine Quittung eingetragen"
          text="Tippe unten auf +, um deine erste Quittung einzutragen."
        />
      </div>
    )
  }

  return (
    <div className="px-5 lg:px-0 lg:pt-8">
      {/* Suche */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: 'easeOut' }}
        className="pt-4 lg:pt-0"
      >
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-soft" />
          <input
            type="search"
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            placeholder="Name, Ort oder Tätigkeit suchen …"
            aria-label="Einträge suchen"
            className="h-14 w-full rounded-xl border border-line bg-paper-raised pl-12 pr-12 text-[17px] text-ink placeholder:text-ink-soft focus:border-brand focus:outline-none focus:shadow-[0_0_0_1px_#1E5B43]"
          />
          {suche && (
            <button
              type="button"
              onClick={() => setSuche('')}
              aria-label="Suche löschen"
              className="absolute right-1 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center text-ink-soft"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </motion.div>

      {/* Filter-Chips (pinnt beim Scrollen unter dem Header) */}
      <div className="no-scrollbar sticky top-14 z-30 -mx-5 flex items-center gap-2 overflow-x-auto bg-paper px-5 py-3 lg:static lg:mx-0 lg:px-0">
        <FilterChip
          aktiv={Boolean(filter.monat)}
          onClick={() => setSheet('monat')}
          icon={<ChevronDown className="h-4 w-4" />}
        >
          {filter.monat ? `Monat: ${formatMonatJahr(filter.monat, jahrFuerMonate)}` : 'Monat'}
        </FilterChip>
        <FilterChip
          aktiv={Boolean(filter.jahr)}
          onClick={() => setSheet('jahr')}
          icon={<ChevronDown className="h-4 w-4" />}
        >
          {filter.jahr ? `Jahr: ${filter.jahr}` : 'Jahr'}
        </FilterChip>
        <FilterChip
          aktiv={Boolean(filter.ort)}
          onClick={() => setSheet('ort')}
          icon={<ChevronDown className="h-4 w-4" />}
        >
          {filter.ort ? `Ort: ${filter.ort}` : 'Ort: Alle'}
        </FilterChip>
        <FilterChip
          aktiv={filter.nurGeschaetzteKm}
          onClick={() => setFilter((f) => ({ ...f, nurGeschaetzteKm: !f.nurGeschaetzteKm }))}
          icon={<Route className="h-4 w-4" />}
        >
          Nur geschätzte km
        </FilterChip>
        {filterAktiv && (
          <button
            type="button"
            onClick={zuruecksetzen}
            className="h-10 shrink-0 px-2 text-[15px] text-ink-soft"
          >
            Zurücksetzen
          </button>
        )}
      </div>

      {/* Kontext-Zeile */}
      <p className="py-1 text-[15px] text-ink-soft">
        <span className="tabular">{kontextZeile}</span>
      </p>

      {/* Filter/Suche ohne Treffer */}
      {gefiltert.length === 0 ? (
        <EmptyState
          titel="Nichts gefunden."
          text="Passe Suche oder Filter an."
          aktion={
            <SekundarButton onClick={zuruecksetzen}>Filter zurücksetzen</SekundarButton>
          }
        />
      ) : (
        <>
          {/* Mobile: Zeilen-Liste */}
          <div className="lg:hidden">
            <AnimatePresence mode="popLayout">
              <div key={filterSchluessel}>
                {kapitel.map((g) => (
                  <section key={`${g.jahr}-${g.monat}`} className="mt-4">
                    <motion.div
                      initial={{ opacity: 0, y: reducedMotion ? 0 : 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.22, ease: 'easeOut' }}
                    >
                      <h2 className="font-serif text-[19px] text-ink">
                        {formatMonatJahr(g.monat, g.jahr)}{' '}
                        <span className="font-sans text-[15px] text-ink-soft">
                          · {g.rows.length} Einträge ·{' '}
                          <span className="tabular font-bold text-ochre">{formatEUR(g.summe)}</span>
                        </span>
                      </h2>
                      <div className="relative mt-1 border-b border-line">
                        <motion.span
                          className="absolute -top-[1px] left-0 h-[2px] w-6 bg-brand"
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: 1 }}
                          transition={{ duration: 0.3, delay: 0.1 }}
                          style={{ transformOrigin: 'left' }}
                          aria-hidden="true"
                        />
                      </div>
                    </motion.div>
                    {g.rows.map((r, i) => (
                      <motion.button
                        key={r.id}
                        type="button"
                        onClick={() => navigate(`/eintrag/${r.id}`)}
                        initial={
                          i < 12
                            ? { opacity: 0, y: reducedMotion ? 0 : 16 }
                            : { opacity: 1, y: 0 }
                        }
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.22, ease: 'easeOut', delay: i < 12 ? i * 0.04 : 0 }}
                        whileTap={{ backgroundColor: '#E3EDE5' }}
                        className="flex w-full items-center gap-3 border-b border-line py-3 text-left"
                      >
                        <span className="w-16 shrink-0">
                          <span className="tabular block text-[18px] font-bold text-ink">
                            {formatDatumKurz(r.datum)}
                          </span>
                          <span className="block text-[13px] text-ink-soft">
                            {formatWochentag(r.datum)}
                          </span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[17px] font-bold text-ink">
                            {anzeigeName(r)}
                          </span>
                          <span className="block truncate text-[15px] text-ink-soft">
                            {r.ort}
                            {r.taetigkeit ? ` · ${r.taetigkeit}` : ''}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="tabular block text-[19px] font-bold text-ink">
                            {formatEUR(r.betrag)}
                          </span>
                          <KmAnzeige r={r} />
                        </span>
                      </motion.button>
                    ))}
                  </section>
                ))}
              </div>
            </AnimatePresence>
          </div>

          {/* Desktop: Tabelle */}
          <div className="hidden lg:block">
            <table className="mt-4 w-full border-collapse">
              <thead>
                <tr className="border-b border-line text-left text-[13px] uppercase tracking-wide text-ink-soft">
                  <th className="py-2 pr-4 font-normal">Datum</th>
                  <th className="py-2 pr-4 font-normal">Name</th>
                  <th className="py-2 pr-4 font-normal">Tätigkeit</th>
                  <th className="py-2 pr-4 font-normal">Ort</th>
                  <th className="py-2 pr-4 text-right font-normal">km</th>
                  <th className="py-2 text-right font-normal">Betrag</th>
                </tr>
              </thead>
              <tbody>
                {kapitel.map((g) => (
                  <Fragment key={`k-${g.jahr}-${g.monat}`}>
                    <tr>
                      <td colSpan={6} className="border-b border-line pb-1 pt-6">
                        <span className="font-serif text-[19px] text-ink">
                          {formatMonatJahr(g.monat, g.jahr)}
                        </span>{' '}
                        <span className="text-[15px] text-ink-soft">
                          · {g.rows.length} Einträge ·{' '}
                          <span className="tabular font-bold text-ochre">{formatEUR(g.summe)}</span>
                        </span>
                      </td>
                    </tr>
                    {g.rows.map((r, i) => (
                      <tr
                        key={r.id}
                        onClick={() => navigate(`/eintrag/${r.id}`)}
                        className={cn(
                          'h-14 cursor-pointer border-b border-line transition-colors duration-150 hover:bg-brand-soft/50',
                          i % 2 === 0 ? 'bg-paper' : 'bg-paper-raised',
                        )}
                      >
                        <td className="tabular pr-4 text-[15px] text-ink">
                          {formatDatumKurz(r.datum)} {formatWochentag(r.datum)}
                        </td>
                        <td className="pr-4 text-[15px] font-bold text-ink">{anzeigeName(r)}</td>
                        <td className="pr-4 text-[15px] text-ink-soft">{r.taetigkeit ?? '—'}</td>
                        <td className="pr-4 text-[15px] text-ink">{r.ort}</td>
                        <td className="pr-4 text-right">
                          <KmAnzeige r={r} />
                        </td>
                        <td className="tabular text-right text-[17px] font-bold text-ink">
                          {formatEUR(r.betrag)}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Monats-Auswahl */}
      <AuswahlSheet titel="Monat wählen" offen={sheet === 'monat'} onSchliessen={() => setSheet(null)}>
        <SheetOption
          label="Alle Monate"
          aktiv={!filter.monat}
          onClick={() => {
            setFilter((f) => ({ ...f, monat: undefined }))
            setSheet(null)
          }}
        />
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
          <SheetOption
            key={m}
            label={formatMonatJahr(m, jahrFuerMonate)}
            aktiv={filter.monat === m}
            onClick={() => {
              setFilter((f) => ({ ...f, monat: m, jahr: f.jahr ?? jahrFuerMonate }))
              setSheet(null)
            }}
          />
        ))}
      </AuswahlSheet>

      {/* Jahres-Auswahl */}
      <AuswahlSheet titel="Jahr wählen" offen={sheet === 'jahr'} onSchliessen={() => setSheet(null)}>
        <SheetOption
          label="Alle Jahre"
          aktiv={!filter.jahr}
          onClick={() => {
            setFilter({ nurGeschaetzteKm: filter.nurGeschaetzteKm })
            setSheet(null)
          }}
        />
        {jahre.map((j) => (
          <SheetOption
            key={j}
            label={String(j)}
            aktiv={filter.jahr === j}
            onClick={() => {
              setFilter((f) => ({ ...f, jahr: j }))
              setSheet(null)
            }}
          />
        ))}
      </AuswahlSheet>

      {/* Orts-Auswahl */}
      <AuswahlSheet titel="Ort wählen" offen={sheet === 'ort'} onSchliessen={() => setSheet(null)}>
        <SheetOption
          label="Alle Orte"
          aktiv={!filter.ort}
          onClick={() => {
            setFilter((f) => ({ ...f, ort: undefined }))
            setSheet(null)
          }}
        />
        {orte.map(([ort, anzahl]) => (
          <SheetOption
            key={ort}
            label={ort}
            detail={`· ${anzahl}`}
            aktiv={filter.ort === ort}
            onClick={() => {
              setFilter((f) => ({ ...f, ort }))
              setSheet(null)
            }}
          />
        ))}
      </AuswahlSheet>
    </div>
  )
}
