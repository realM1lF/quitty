// Seite: Einstellungen — Route `/einstellungen` (Spec: design/einstellungen.md).
// Vier Abschnitte: Meine Adresse (Geocoding-Status + Mini-Stempel), km-Pauschale
// (Autosave beim Verlassen), Export (Zeitraum-Wahl + PDF/CSV für den Steuerberater),
// Konto & App (Abmelden, Add-to-Homescreen-Anleitung, Footer).

import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  ChevronDown,
  FileDown,
  List as ListIcon,
  Loader2,
  Mail,
  MapPin,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { ConfirmDialog, PrimarButton, SekundarButton, TextField, useSnackbar } from '@/components/ui-ext'
import { useAuth } from '@/lib/auth'
import { listReceipts, resetDemoDaten, saveSettings } from '@/lib/db'
import { geocode } from '@/lib/geo'
import { gleicherZeitraum, zeitraumFilter, zeitraumLabel } from '@/lib/zeitraum'
import type { Zeitraum } from '@/lib/zeitraum'
import type { Receipt } from '@/lib/types'
import { cn } from '@/lib/utils'

type AdresseStatus = 'idle' | 'prueft' | 'gefunden' | 'fehler'

/** „Hauptstraße 12" → { strasse: „Hauptstraße", hausnr: „12" } */
function splitAdresse(homeStrasse: string | null | undefined): { strasse: string; hausnr: string } {
  if (!homeStrasse) return { strasse: '', hausnr: '' }
  const m = homeStrasse.match(/^(.*?)\s+(\S+)$/)
  return m ? { strasse: m[1], hausnr: m[2] } : { strasse: homeStrasse, hausnr: '' }
}

/** „0,30" → 0.3; ungültig → null */
function parsePauschale(text: string): number | null {
  const wert = Number(text.trim().replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(wert) && text.trim() !== '' ? wert : null
}

/** „2026-05" / „2026" aus dem Hash (#export?periode=…) */
function parseHashPeriode(hash: string): Zeitraum | null {
  const m = hash.match(/periode=(\d{4})(?:-(\d{1,2}))?/)
  if (!m) return null
  return m[2]
    ? { typ: 'monat', jahr: Number(m[1]), monat: Number(m[2]) }
    : { typ: 'jahr', jahr: Number(m[1]) }
}

// ---------- Bausteine ----------

/** Abschnittstitel (13 px, ink-soft, Kapitälchen) + Trennlinie (außer beim ersten) */
function Abschnitt({
  titel,
  erste,
  id,
  children,
}: {
  titel: string
  erste?: boolean
  id?: string
  children: React.ReactNode
}) {
  return (
    <motion.section
      id={id}
      variants={{
        versteckt: { opacity: 0, y: 16 },
        sichtbar: { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' } },
      }}
      className={cn(!erste && 'border-t border-line pt-5', id === 'export' && 'scroll-mt-20')}
    >
      <h2 className="mb-3 text-[13px] font-bold uppercase tracking-[0.06em] text-ink-soft">
        {titel}
      </h2>
      <div className="rounded-xl border border-line bg-paper-raised p-4">{children}</div>
    </motion.section>
  )
}

/** Mini-Stempel „Gespeichert" (24 px Caveat, kleiner Oval-Ring, −8°) über dem Speichern-Button. */
function MiniStempel({ sichtbar }: { sichtbar: boolean }) {
  const reducedMotion = useReducedMotion()
  return (
    <div className="flex h-12 items-center justify-center" aria-live="polite">
      <AnimatePresence>
        {sichtbar && (
          <motion.div
            className="relative flex items-center justify-center"
            initial={reducedMotion ? { opacity: 0, rotate: -8 } : { opacity: 0, scale: 1.4, rotate: -14 }}
            animate={{ opacity: 1, scale: 1, rotate: -8 }}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
            transition={
              reducedMotion ? { duration: 0.2 } : { type: 'spring', stiffness: 500, damping: 18 }
            }
          >
            <svg width="140" height="48" viewBox="0 0 140 48" fill="none" className="absolute" aria-hidden="true">
              <motion.path
                d="M 10 26 C 8 12, 40 4, 72 5 C 104 6, 134 12, 131 26 C 128 40, 96 45, 68 44 C 40 43, 12 40, 10 26 Z"
                stroke="#1E5B43"
                strokeWidth="2.5"
                strokeLinecap="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={reducedMotion ? { duration: 0.01 } : { duration: 0.3, ease: 'easeOut' }}
              />
            </svg>
            <span className="relative font-hand text-[24px] leading-none text-brand">Gespeichert</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Zwei Segmente 48 px „Monat | Jahr" mit layoutId-Gleiter (150 ms) */
function ZeitraumSegmente({
  wert,
  onChange,
}: {
  wert: 'monat' | 'jahr'
  onChange: (w: 'monat' | 'jahr') => void
}) {
  const optionen: Array<{ wert: 'monat' | 'jahr'; label: string }> = [
    { wert: 'monat', label: 'Monat' },
    { wert: 'jahr', label: 'Jahr' },
  ]
  return (
    <div className="grid h-12 grid-cols-2 gap-2" role="radiogroup" aria-label="Zeitraum">
      {optionen.map((opt) => {
        const aktiv = wert === opt.wert
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
                layoutId="export-zeitraum-aktiv"
                transition={{ duration: 0.15, ease: 'easeOut' }}
                className="absolute inset-0 rounded-xl border-[1.5px] border-brand bg-brand-soft"
              />
            )}
            {!aktiv && <span className="absolute inset-0 rounded-xl border border-line bg-paper" />}
            <span className="relative">{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Bottom-Sheet-Liste der Monate/Jahre mit Einträgen (Spring wie neu.md) */
function ZeitraumSheet({
  offen,
  titel,
  optionen,
  gewaehlt,
  onWaehlen,
  onSchliessen,
}: {
  offen: boolean
  titel: string
  optionen: Zeitraum[]
  gewaehlt: Zeitraum
  onWaehlen: (z: Zeitraum) => void
  onSchliessen: () => void
}) {
  const reducedMotion = useReducedMotion()
  return (
    <AnimatePresence>
      {offen && (
        <>
          <motion.div
            className="fixed inset-0 z-[70] bg-ink"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onSchliessen}
            aria-hidden="true"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={titel}
            className="fixed inset-x-0 bottom-0 z-[71] mx-auto w-full max-w-[480px] rounded-t-[20px] bg-paper-raised shadow-sheet pb-safe"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={
              reducedMotion
                ? { duration: 0.15 }
                : { type: 'spring', stiffness: 380, damping: 34 }
            }
          >
            <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-line" aria-hidden="true" />
            <h3 className="px-5 pt-4 font-serif text-[20px] text-ink">{titel}</h3>
            <ul className="max-h-[50vh] overflow-y-auto px-2 pb-2 pt-2">
              {optionen.map((z) => {
                const aktiv = gleicherZeitraum(z, gewaehlt)
                return (
                  <li key={zeitraumLabel(z)}>
                    <button
                      type="button"
                      onClick={() => onWaehlen(z)}
                      className={cn(
                        'flex h-14 w-full items-center justify-between rounded-xl px-4 text-[17px]',
                        aktiv ? 'bg-brand-soft font-bold text-brand' : 'text-ink',
                      )}
                    >
                      {zeitraumLabel(z)}
                      {aktiv && <span className="h-2 w-2 rounded-full bg-brand" aria-hidden="true" />}
                    </button>
                  </li>
                )
              })}
              {optionen.length === 0 && (
                <li className="px-4 py-3 text-[15px] text-ink-soft">
                  Noch keine Einträge vorhanden.
                </li>
              )}
            </ul>
            <button
              type="button"
              onClick={onSchliessen}
              className="flex h-12 w-full items-center justify-center text-[15px] text-ink-soft"
            >
              Abbrechen
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

/** Kleiner Anleitungs-Dialog „Zum Home-Bildschirm hinzufügen" (iOS, 2 Schritte) */
function HomescreenDialog({ offen, onSchliessen }: { offen: boolean; onSchliessen: () => void }) {
  return (
    <AnimatePresence>
      {offen && (
        <>
          <motion.div
            className="fixed inset-0 z-[70] bg-ink"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onSchliessen}
            aria-hidden="true"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Zum Home-Bildschirm hinzufügen"
            className="fixed inset-x-5 top-1/2 z-[71] mx-auto w-full max-w-[360px] -translate-y-1/2 rounded-2xl border border-line bg-paper-raised p-5"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            <div className="flex items-start justify-between">
              <h3 className="font-serif text-[20px] text-ink">Zum Home-Bildschirm</h3>
              <button
                type="button"
                onClick={onSchliessen}
                aria-label="Schließen"
                className="-mr-1 -mt-1 flex h-10 w-10 items-center justify-center text-ink-soft"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <ol className="mt-3 flex flex-col gap-3 text-[15px] text-ink">
              <li className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[15px] font-bold text-brand">
                  1
                </span>
                <span className="pt-1">Tippe unten im Browser auf „Teilen".</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[15px] font-bold text-brand">
                  2
                </span>
                <span className="flex items-center gap-2 pt-1">
                  Wähle in der Liste
                  <ListIcon className="h-5 w-5 shrink-0 text-ink-soft" aria-hidden="true" />
                  „Zum Home-Bildschirm".
                </span>
              </li>
            </ol>
            <p className="mt-3 text-[13px] text-ink-soft">
              Danach liegt QuittyPro wie eine App auf deinem iPhone.
            </p>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// ---------- Seite ----------

export default function Einstellungen() {
  const { settings, refreshSettings, signOut, user, isDemoMode } = useAuth()
  const { zeigeSnackbar } = useSnackbar()
  const navigate = useNavigate()
  const location = useLocation()

  // --- Abschnitt 1: Adresse ---
  const [strasse, setStrasse] = useState('')
  const [hausnr, setHausnr] = useState('')
  const [plz, setPlz] = useState('')
  const [ort, setOrt] = useState('')
  const [adresseStatus, setAdresseStatus] = useState<AdresseStatus>('idle')
  const [stempel, setStempel] = useState(false)
  const adresseInit = useRef(false)
  const stempelTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Felder einmalig aus den Settings vorbefüllen (nicht während des Tippens überschreiben)
  useEffect(() => {
    if (!settings || adresseInit.current) return
    adresseInit.current = true
    const { strasse: s, hausnr: h } = splitAdresse(settings.home_strasse)
    setStrasse(s)
    setHausnr(h)
    setPlz(settings.home_plz ?? '')
    setOrt(settings.home_ort ?? '')
  }, [settings])

  const strasseHausnr = `${strasse.trim()} ${hausnr.trim()}`.trim()
  const adresseKomplett =
    strasse.trim() !== '' && hausnr.trim() !== '' && plz.trim() !== '' && ort.trim() !== ''
  const adresseGeaendert = Boolean(
    settings &&
      (strasseHausnr !== (settings.home_strasse ?? '') ||
        plz.trim() !== (settings.home_plz ?? '') ||
        ort.trim() !== (settings.home_ort ?? '')),
  )

  async function adresseSpeichern() {
    if (!adresseKomplett || adresseStatus === 'prueft') return
    setAdresseStatus('prueft')
    const punkt = await geocode({
      strasse: strasse.trim(),
      hausnr: hausnr.trim(),
      plz: plz.trim(),
      ort: ort.trim(),
    })
    await saveSettings({
      home_strasse: strasseHausnr,
      home_plz: plz.trim(),
      home_ort: ort.trim(),
      home_lat: punkt?.lat ?? null,
      home_lng: punkt?.lng ?? null,
      onboarded: true,
    })
    await refreshSettings()
    if (punkt) {
      setAdresseStatus('gefunden')
      setStempel(true)
      if (stempelTimer.current) clearTimeout(stempelTimer.current)
      // 300 ms Ring + 500 ms halten, dann 200 ms ausfaden
      stempelTimer.current = setTimeout(() => setStempel(false), 900)
    } else {
      setAdresseStatus('fehler')
    }
  }

  const statusAnzeige: AdresseStatus | null =
    adresseStatus !== 'idle'
      ? adresseStatus
      : settings?.home_lat != null
        ? 'gefunden'
        : settings?.home_strasse
          ? 'fehler'
          : null

  // --- Abschnitt 2: km-Pauschale ---
  const [pauschaleText, setPauschaleText] = useState('')
  const [pauschaleWarn, setPauschaleWarn] = useState(false)
  const pauschaleInit = useRef(false)

  useEffect(() => {
    if (!settings || pauschaleInit.current) return
    pauschaleInit.current = true
    setPauschaleText(settings.km_pauschale.toFixed(2).replace('.', ','))
  }, [settings])

  const pauschaleWert = parsePauschale(pauschaleText)
  const pauschaleAbweichung = pauschaleWert != null && Math.abs(pauschaleWert - 0.3) > 0.0001

  async function pauschaleSpeichernWennGueltig() {
    const wert = parsePauschale(pauschaleText)
    if (wert == null || wert < 0.05 || wert > 2) {
      setPauschaleWarn(true)
      return
    }
    setPauschaleWarn(false)
    const gerundet = Math.round(wert * 100) / 100
    if (settings && Math.abs(gerundet - settings.km_pauschale) < 0.0001) return
    await saveSettings({ km_pauschale: gerundet })
    await refreshSettings()
    zeigeSnackbar('km-Pauschale gespeichert', 2500)
  }

  function pauschaleZuruecksetzen() {
    setPauschaleText('0,30')
    setPauschaleWarn(false)
    void saveSettings({ km_pauschale: 0.3 }).then(async () => {
      await refreshSettings()
      zeigeSnackbar('km-Pauschale gespeichert', 2500)
    })
  }

  // --- Abschnitt 3: Export ---
  const jetzt = new Date()
  const [zeitraum, setZeitraum] = useState<Zeitraum>({
    typ: 'monat',
    jahr: jetzt.getFullYear(),
    monat: jetzt.getMonth() + 1,
  })
  const [alleEintraege, setAlleEintraege] = useState<Receipt[]>([])
  const [eintraege, setEintraege] = useState<Receipt[]>([])
  const [sheetOffen, setSheetOffen] = useState(false)
  const [exportLaeuft, setExportLaeuft] = useState<'pdf' | 'csv' | null>(null)
  const hashVerarbeitet = useRef(false)

  // Alle Einträge laden (für die Perioden-Liste) + #export-Parameter anwenden
  useEffect(() => {
    let aktiv = true
    void listReceipts().then((rows) => {
      if (!aktiv) return
      setAlleEintraege(rows)
      if (!hashVerarbeitet.current) {
        hashVerarbeitet.current = true
        const periode = parseHashPeriode(location.hash)
        if (periode) setZeitraum(periode)
      }
    })
    return () => {
      aktiv = false
    }
  }, [location.hash])

  // Zum Export-Abschnitt scrollen, wenn über #export geöffnet
  useEffect(() => {
    if (location.hash.startsWith('#export')) {
      document.getElementById('export')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [location.hash])

  // Einträge des gewählten Zeitraums
  useEffect(() => {
    let aktiv = true
    void listReceipts(zeitraumFilter(zeitraum)).then((rows) => {
      if (aktiv) setEintraege(rows)
    })
    return () => {
      aktiv = false
    }
  }, [zeitraum])

  // Verfügbare Perioden (Monate bzw. Jahre mit Einträgen), aktueller Zeitraum immer enthalten
  const optionen = useMemo<Zeitraum[]>(() => {
    const set = new Map<string, Zeitraum>()
    for (const r of alleEintraege) {
      const jahr = Number(r.datum.slice(0, 4))
      const monat = Number(r.datum.slice(5, 7))
      if (zeitraum.typ === 'monat') {
        const z: Zeitraum = { typ: 'monat', jahr, monat }
        set.set(`${jahr}-${monat}`, z)
      } else {
        const z: Zeitraum = { typ: 'jahr', jahr }
        set.set(String(jahr), z)
      }
    }
    const key =
      zeitraum.typ === 'monat' ? `${zeitraum.jahr}-${zeitraum.monat}` : String(zeitraum.jahr)
    if (!set.has(key)) set.set(key, zeitraum)
    return [...set.values()].sort((a, b) => {
      if (a.jahr !== b.jahr) return b.jahr - a.jahr
      const ma = a.typ === 'monat' ? a.monat : 0
      const mb = b.typ === 'monat' ? b.monat : 0
      return mb - ma
    })
  }, [alleEintraege, zeitraum])

  function modusWechseln(typ: 'monat' | 'jahr') {
    if (typ === zeitraum.typ) return
    setZeitraum(
      typ === 'jahr'
        ? { typ: 'jahr', jahr: zeitraum.jahr }
        : { typ: 'monat', jahr: zeitraum.jahr, monat: jetzt.getMonth() + 1 },
    )
  }

  async function exportiere(art: 'pdf' | 'csv') {
    if (exportLaeuft || eintraege.length === 0) return
    setExportLaeuft(art)
    try {
      // pdfmake + Schriften werden erst jetzt geladen (eigener Chunk)
      const { erstellePdf, erstelleCsv } = await import('@/lib/export')
      if (art === 'pdf') {
        await erstellePdf(eintraege, settings, zeitraum)
        zeigeSnackbar('PDF erstellt', 3000)
      } else {
        await erstelleCsv(eintraege, settings, zeitraum)
        zeigeSnackbar('CSV erstellt', 3000)
      }
    } catch {
      zeigeSnackbar('Export hat nicht geklappt — bitte noch einmal versuchen.')
    } finally {
      setExportLaeuft(null)
    }
  }

  // --- Abschnitt 4: Konto & App ---
  const [dialogOffen, setDialogOffen] = useState(false)
  // --- Abschnitt 5: App zurücksetzen (nur Demo-Modus) ---
  const [resetDialogOffen, setResetDialogOffen] = useState(false)

  async function abmelden() {
    await signOut()
    navigate('/login')
  }

  const exportDisabled = eintraege.length === 0 || exportLaeuft !== null

  return (
    <div className="mx-auto w-full max-w-[640px] px-5 pt-6 lg:px-0 lg:pt-8">
      <h1 className="hidden font-serif text-[28px] text-ink lg:block">Einstellungen</h1>
      <motion.div
        initial="versteckt"
        animate="sichtbar"
        variants={{ sichtbar: { transition: { staggerChildren: 0.08 } } }}
        className="mt-5 flex flex-col gap-8 lg:mt-6"
      >
        {/* Abschnitt 1: Meine Adresse */}
        <Abschnitt titel="Meine Adresse" erste>
          <p className="flex items-center gap-2 text-[15px] text-ink-soft">
            <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
            Startpunkt für alle Fahrtstrecken-Berechnungen.
          </p>
          <div className="mt-4 flex flex-col gap-4">
            <div className="flex gap-3">
              <TextField
                label="Straße"
                value={strasse}
                onChange={(e) => setStrasse(e.target.value)}
                placeholder="Hauptstraße"
                autoComplete="street-address"
                containerClassName="flex-[2]"
              />
              <TextField
                label="Hausnr."
                value={hausnr}
                onChange={(e) => setHausnr(e.target.value)}
                placeholder="12"
                containerClassName="flex-1"
              />
            </div>
            <div className="flex gap-3">
              <TextField
                label="PLZ"
                value={plz}
                onChange={(e) => setPlz(e.target.value)}
                placeholder="97232"
                inputMode="numeric"
                autoComplete="postal-code"
                containerClassName="flex-1"
              />
              <TextField
                label="Ort"
                value={ort}
                onChange={(e) => setOrt(e.target.value)}
                placeholder="Giebelstadt"
                autoComplete="address-level2"
                containerClassName="flex-[2]"
              />
            </div>

            {/* Geocode-Status: Punkt farblich 200 ms Fade, Text crossfadet */}
            <div className="min-h-[20px] text-[13px]" aria-live="polite">
              <AnimatePresence mode="wait" initial={false}>
                {statusAnzeige === 'prueft' && (
                  <motion.span
                    key="prueft"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center gap-2 text-ink-soft"
                  >
                    <motion.span
                      className="h-2 w-2 rounded-full bg-ochre"
                      animate={{ opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 0.6, repeat: Infinity }}
                    />
                    Adresse wird geprüft …
                  </motion.span>
                )}
                {statusAnzeige === 'gefunden' && (
                  <motion.span
                    key="gefunden"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center gap-2 text-ink-soft"
                  >
                    <motion.span
                      className="h-2 w-2 rounded-full bg-brand"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.2 }}
                    />
                    Adresse gefunden — Fahrten werden von hier berechnet.
                  </motion.span>
                )}
                {statusAnzeige === 'fehler' && (
                  <motion.span
                    key="fehler"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center gap-2 text-warn"
                  >
                    <span className="h-2 w-2 rounded-full bg-warn" />
                    Adresse nicht gefunden — bitte Schreibweise prüfen.
                  </motion.span>
                )}
              </AnimatePresence>
            </div>

            <MiniStempel sichtbar={stempel} />
            <PrimarButton
              onClick={() => void adresseSpeichern()}
              disabled={!adresseKomplett || !adresseGeaendert}
              loading={adresseStatus === 'prueft'}
            >
              Adresse speichern
            </PrimarButton>
          </div>
        </Abschnitt>

        {/* Abschnitt 2: km-Pauschale */}
        <Abschnitt titel="km-Pauschale">
          <p className="text-[15px] text-ink-soft">
            Wird für den km-Wert in der Auswertung und im PDF verwendet.
          </p>
          <div className="mt-4 flex items-start gap-4">
            <div className="relative w-44 shrink-0">
              <TextField
                label="Pauschale"
                value={pauschaleText}
                onChange={(e) => {
                  setPauschaleText(e.target.value)
                  if (pauschaleWarn) setPauschaleWarn(false)
                }}
                onBlur={() => void pauschaleSpeichernWennGueltig()}
                inputMode="decimal"
                placeholder="0,30"
                warn={pauschaleWarn}
                hinweis={pauschaleWarn ? 'Bitte einen Wert zwischen 0,05 und 2,00 € eingeben.' : undefined}
                className="tabular pr-16"
                containerClassName="w-full"
              />
              <span
                className="pointer-events-none absolute right-0 top-[27px] flex h-14 items-center pr-4 text-[15px] text-ink-soft"
                aria-hidden="true"
              >
                €/km
              </span>
            </div>
            {pauschaleAbweichung && (
              <button
                type="button"
                onClick={pauschaleZuruecksetzen}
                className="mt-[27px] flex h-14 items-center text-[15px] text-brand underline underline-offset-2"
              >
                Zurück auf 0,30 €
              </button>
            )}
          </div>
        </Abschnitt>

        {/* Abschnitt 3: Export */}
        <Abschnitt titel="Export" id="export">
          <p className="flex items-center gap-2 text-[15px] text-ink-soft">
            <FileDown className="h-4 w-4 shrink-0" aria-hidden="true" />
            Fertige Abrechnung für deinen Steuerberater — als PDF oder CSV.
          </p>
          <div className="mt-4 flex flex-col gap-3">
            <ZeitraumSegmente wert={zeitraum.typ} onChange={modusWechseln} />
            <button
              type="button"
              onClick={() => setSheetOffen(true)}
              aria-haspopup="dialog"
              className="flex h-14 w-full items-center justify-between rounded-xl border border-line bg-paper-raised px-4 text-[17px] text-ink focus:outline-none focus:border-brand focus:shadow-[0_0_0_1px_#1E5B43]"
            >
              {zeitraumLabel(zeitraum)}
              <ChevronDown className="h-5 w-5 text-ink-soft" aria-hidden="true" />
            </button>

            {eintraege.length === 0 && (
              <p className="text-[13px] text-ink-soft">Keine Einträge in diesem Zeitraum.</p>
            )}

            <PrimarButton
              onClick={() => void exportiere('pdf')}
              disabled={exportDisabled}
              loading={exportLaeuft === 'pdf'}
              icon={exportLaeuft === 'pdf' ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileDown className="h-5 w-5" />}
            >
              {exportLaeuft === 'pdf' ? 'PDF wird erstellt …' : 'PDF für Steuerberater'}
            </PrimarButton>
            <SekundarButton
              onClick={() => void exportiere('csv')}
              disabled={exportDisabled}
              icon={exportLaeuft === 'csv' ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileDown className="h-5 w-5" />}
            >
              {exportLaeuft === 'csv' ? 'CSV wird erstellt …' : 'CSV exportieren'}
            </SekundarButton>
          </div>
        </Abschnitt>

        {/* Abschnitt 4: Konto & App */}
        <Abschnitt titel="Konto & App">
          <div className="flex items-center gap-3">
            <Mail className="h-5 w-5 shrink-0 text-ink-soft" aria-hidden="true" />
            <span className="text-[15px] text-ink-soft">Angemeldet als</span>
            <span className="truncate text-[17px] text-ink">
              {isDemoMode ? 'Demo-Modus (lokal auf diesem Gerät)' : (user?.email ?? '—')}
            </span>
          </div>
          <button
            type="button"
            onClick={() => void abmelden()}
            className="mt-2 flex h-12 items-center text-[17px] font-bold text-danger"
          >
            Abmelden
          </button>
          <div className="border-t border-line" />
          <button
            type="button"
            onClick={() => setDialogOffen(true)}
            className="flex h-12 w-full items-center gap-2 text-left text-[15px] text-ink-soft"
          >
            <Plus className="h-5 w-5 shrink-0" aria-hidden="true" />
            Zum Home-Bildschirm hinzufügen
          </button>
        </Abschnitt>

        {/* Abschnitt 5: App zurücksetzen — nur im Demo-Modus sichtbar.
            Im Supabase-Betrieb liegen die Daten sicher auf dem Server und
            werden hier nicht angefasst. */}
        {isDemoMode && (
          <Abschnitt titel="App zurücksetzen">
            <p className="text-[15px] text-ink-soft">
              Löscht alle Einträge, deine Adresse und gespeicherte Fotos auf
              diesem Gerät. Danach startet QuittyPro wie neu — mit der
              Adress-Einrichtung.
            </p>
            <button
              type="button"
              onClick={() => setResetDialogOffen(true)}
              className="mt-2 flex h-12 items-center gap-2 text-[17px] font-bold text-danger"
            >
              <Trash2 className="h-5 w-5 shrink-0" aria-hidden="true" />
              Alle Daten löschen & neu starten
            </button>
          </Abschnitt>
        )}
      </motion.div>

      {/* Footer-Zeile */}
      <p className="mt-8 pb-4 text-center text-[13px] text-ink-soft">
        QuittyPro · Version 1.1 ·{' '}
        <span className="font-hand text-[17px] text-brand">mit Sorgfalt für Paula gemacht</span>
      </p>

      <ZeitraumSheet
        offen={sheetOffen}
        titel={zeitraum.typ === 'monat' ? 'Monat wählen' : 'Jahr wählen'}
        optionen={optionen}
        gewaehlt={zeitraum}
        onWaehlen={(z) => {
          setZeitraum(z)
          setSheetOffen(false)
        }}
        onSchliessen={() => setSheetOffen(false)}
      />
      <HomescreenDialog offen={dialogOffen} onSchliessen={() => setDialogOffen(false)} />
      <ConfirmDialog
        offen={resetDialogOffen}
        titel="Wirklich alles löschen?"
        bestaetigenLabel="Ja, alles löschen"
        gefahr
        onBestaetigen={() => {
          resetDemoDaten()
          window.location.reload()
        }}
        onAbbrechen={() => setResetDialogOffen(false)}
      >
        Alle Einträge, deine Adresse und gespeicherte Fotos werden von diesem
        Gerät entfernt. Das kann nicht rückgängig gemacht werden.
      </ConfirmDialog>
    </div>
  )
}
