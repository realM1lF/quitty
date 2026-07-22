// Eintrag-Detail & Bearbeiten — Route `/eintrag/:id` (Spec: design/detail.md).
// Zwei Modi: Ansicht (Standard, ruhig lesbar) & Bearbeiten (Formular-Komponenten
// wie neu.md §2). Signatur: km-Block (grün = exakt / ochre = geschätzt, Anzeige
// Hin+Rück ×2, manueller Override mit „Von dir angepasst"), Belegfoto mit Lightbox,
// Stempel-Animation beim Speichern, Löschen immer mit Rückfrage.
// Desktop ≥ 1024 px: Inhalt max. 640 px zentriert, Foto links (240 px), Felder rechts.
// Der Unterseiten-Kopf (Layout) bekommt per Kontext den Bearbeiten-Stift und einen
// Zurück-Abfangen („Änderungen verwerfen?").

import { useContext, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from 'framer-motion'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { Check, Pencil, Route, Trash2, X } from 'lucide-react'
import {
  deleteBelegFoto,
  deleteReceipt,
  getFotoUrl,
  getReceipt,
  getSettings,
  updateReceipt,
} from '@/lib/db'
import { berechneKm } from '@/lib/geo'
import type { Anrede, KmQuelle, Receipt, Settings } from '@/lib/types'
import { formatEUR, formatKm, parseDatum } from '@/lib/format'
import {
  AnredeSegmente,
  ConfirmDialog,
  EmptyState,
  PrimarButton,
  SekundarButton,
  StampOverlay,
  TextField,
  useSnackbar,
} from '@/components/ui-ext'
import { UnterseitenKopfContext } from '@/components/kopf-kontext'
import { useWeicheZahl } from '@/hooks/use-weiche-zahl'
import { cn } from '@/lib/utils'

// ---------- Helfer ----------

function nameMit(anrede: Anrede, vorname: string, nachname: string): string {
  const kurz = anrede === 'herr' ? 'Hr.' : anrede === 'frau' ? 'Fr.' : ''
  return [kurz, vorname.trim(), nachname.trim()].filter(Boolean).join(' ')
}

/** „32,5" | „32.5" → 32.5 — Komma bevorzugt; bei Komma ist der Punkt Tausender. */
function parseDeZahl(s: string): number | null {
  const t = s.trim()
  if (!t) return null
  const norm = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t
  const n = Number(norm)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function zahlZuText(n: number, nachkomma: number): string {
  return new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: nachkomma,
    maximumFractionDigits: nachkomma,
  }).format(n)
}

// ---------- Formular-Modell ----------

interface Formular {
  datum: string
  anrede: Anrede
  vorname: string
  nachname: string
  betrag: string
  taetigkeit: string
  ort: string
  plz: string
  strasse: string
  hausnr: string
  /** km einfache Strecke als Eingabetext (deutsches Komma) */
  kmText: string
  kmQuelle: KmQuelle | null
  kmManuell: boolean
}

function formularAus(r: Receipt): Formular {
  return {
    datum: r.datum,
    anrede: r.anrede,
    vorname: r.vorname ?? '',
    nachname: r.nachname,
    betrag: zahlZuText(r.betrag, 2),
    taetigkeit: r.taetigkeit ?? '',
    ort: r.ort,
    plz: r.plz ?? '',
    strasse: r.strasse ?? '',
    hausnr: r.hausnr ?? '',
    kmText: r.km_einfach != null ? zahlZuText(r.km_einfach, 1) : '',
    kmQuelle: r.km_quelle,
    kmManuell: r.km_manuell,
  }
}

function validiere(f: Formular): Record<string, boolean> {
  const fehl: Record<string, boolean> = {}
  if (!f.datum) fehl.datum = true
  if (!f.nachname.trim()) fehl.nachname = true
  const b = parseDeZahl(f.betrag)
  if (b == null || b <= 0) fehl.betrag = true
  if (!f.ort.trim()) fehl.ort = true
  return fehl
}

// ---------- km-Block (Signatur-Komponente) ----------

interface KmBlockProps {
  bearbeiten: boolean
  kmEinfach: number | null
  kmQuelle: KmQuelle | null
  kmManuell: boolean
  kmLaden: boolean
  ort: string
  /** „Hauptstraße 12" (für die Exakt-Unterzeile), leer wenn keine Adresse */
  adresse: string
  editorOffen: boolean
  kmText: string
  onAnpassen: () => void
  onKmText: (t: string) => void
  onAutomatisch: () => void
}

function KmBlock({
  bearbeiten,
  kmEinfach,
  kmQuelle,
  kmManuell,
  kmLaden,
  ort,
  adresse,
  editorOffen,
  kmText,
  onAnpassen,
  onKmText,
  onAutomatisch,
}: KmBlockProps) {
  const reduced = useReducedMotion()
  const ausstehend = kmLaden || kmEinfach == null
  const geschaetzt = !kmManuell && kmQuelle !== 'adresse'
  const farbe =
    kmQuelle == null ? 'text-ink-soft' : kmQuelle === 'adresse' && !kmManuell ? 'text-brand' : 'text-ochre'
  const punkt =
    kmQuelle == null ? 'bg-ink-soft' : kmQuelle === 'adresse' && !kmManuell ? 'bg-brand' : 'bg-ochre'

  return (
    <div className="rounded-xl border border-line bg-paper-raised p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-h-7 items-center gap-2">
          <motion.span
            className={cn('h-2.5 w-2.5 shrink-0 rounded-full', punkt)}
            initial={reduced ? false : { scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.15 }}
            aria-hidden="true"
          />
          {ausstehend ? (
            <span className="text-[15px] text-ink-soft">km wird berechnet …</span>
          ) : (
            <motion.span
              key={`${kmEinfach}-${geschaetzt}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
              className={cn('tabular text-[20px] font-bold', farbe)}
            >
              {geschaetzt ? `~ ${formatKm(kmEinfach * 2)}` : formatKm(kmEinfach * 2)}
            </motion.span>
          )}
        </div>
        <button
          type="button"
          onClick={onAnpassen}
          className="-mr-2 -my-1 flex h-12 shrink-0 items-center px-2 text-[13px] font-bold text-brand"
        >
          Anpassen
        </button>
      </div>

      {!ausstehend && kmQuelle === 'adresse' && !kmManuell && adresse && (
        <p className="mt-1 text-[13px] text-ink-soft">Exakt berechnet bis {adresse}</p>
      )}
      {!ausstehend && kmQuelle === 'ort' && !kmManuell && (
        <p className="mt-1 text-[13px] text-ink-soft">
          Geschätzt zum Ortsmittelpunkt von {ort}
        </p>
      )}
      <p className="mt-1 flex items-center gap-1.5 text-[13px] text-ink-soft">
        <Route className="h-3.5 w-3.5" aria-hidden="true" />
        Hin- + Rückfahrt
      </p>
      {kmManuell && (
        <p className="mt-1 flex items-center gap-1.5 text-[13px] text-ochre">
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          Von dir angepasst
        </p>
      )}

      {/* Override-Editor (nur Bearbeitungsmodus) */}
      <AnimatePresence initial={false}>
        {bearbeiten && editorOffen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="mt-3 border-t border-line pt-3">
              <label htmlFor="km-override" className="mb-1 block text-[15px] text-ink-soft">
                Kilometer
              </label>
              <div className="relative">
                <input
                  id="km-override"
                  inputMode="decimal"
                  value={kmText}
                  onChange={(e) => onKmText(e.target.value)}
                  placeholder="0,0"
                  className="tabular h-14 w-full rounded-xl border border-line bg-paper px-4 pr-12 text-[17px] text-ink placeholder:text-ink-soft focus:border-brand focus:outline-none focus:shadow-[0_0_0_1px_#1E5B43]"
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[15px] text-ink-soft">
                  km
                </span>
              </div>
              <p className="mt-1 text-[13px] text-ink-soft">
                Einfache Strecke — angezeigt wird Hin- + Rückfahrt.
              </p>
              <button
                type="button"
                onClick={onAutomatisch}
                className="mt-1 flex h-12 items-center text-[15px] font-bold text-brand"
              >
                Automatisch berechnen
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ---------- Foto-Lightbox ----------

function Lightbox({ url, offen, onSchliessen }: { url: string; offen: boolean; onSchliessen: () => void }) {
  return (
    <AnimatePresence>
      {offen && (
        <motion.div
          className="fixed inset-0 z-[85] flex items-center justify-center bg-ink/95 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onSchliessen}
          role="dialog"
          aria-modal="true"
          aria-label="Belegfoto vergrößert"
        >
          <motion.img
            src={url}
            alt="Belegfoto"
            initial={{ scale: 0.92 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.95 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="max-h-[92dvh] max-w-[92vw] rounded-lg object-contain"
          />
          <button
            type="button"
            onClick={onSchliessen}
            aria-label="Schließen"
            className="absolute right-3 top-3 flex h-12 w-12 items-center justify-center text-paper"
          >
            <X className="h-7 w-7" strokeWidth={2} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ---------- Seite ----------

export default function Detail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { zeigeSnackbar } = useSnackbar()
  const setKopf = useContext(UnterseitenKopfContext)
  const reduced = useReducedMotion()
  const flashControls = useAnimationControls()

  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [laden, setLaden] = useState(true)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [fotoUrl, setFotoUrl] = useState<string | null>(null)

  const [modus, setModus] = useState<'ansicht' | 'bearbeiten'>('ansicht')
  const [form, setForm] = useState<Formular | null>(null)
  const [ausgang, setAusgang] = useState('')
  const [fehler, setFehler] = useState<Record<string, boolean>>({})
  const [speichernLaeuft, setSpeichernLaeuft] = useState(false)
  const [stempel, setStempel] = useState(false)

  const [loeschDialog, setLoeschDialog] = useState(false)
  const [verwerfenDialog, setVerwerfenDialog] = useState(false)
  const [lightbox, setLightbox] = useState(false)
  const [kmEditor, setKmEditor] = useState(false)
  const [kmLaden, setKmLaden] = useState(false)

  // Eintrag + Einstellungen laden
  useEffect(() => {
    if (!id) return
    let aktiv = true
    Promise.all([getReceipt(id), getSettings().catch(() => null)])
      .then(([r, s]) => {
        if (!aktiv) return
        setReceipt(r)
        setSettings(s)
        if (r) {
          const f = formularAus(r)
          setForm(f)
          setAusgang(JSON.stringify(f))
        }
        setLaden(false)
      })
      .catch(() => {
        if (aktiv) setLaden(false)
      })
    return () => {
      aktiv = false
    }
  }, [id])

  // Belegfoto-URL laden
  useEffect(() => {
    if (!receipt?.foto_path) {
      setFotoUrl(null)
      return
    }
    let aktiv = true
    getFotoUrl(receipt.foto_path).then((url) => {
      if (aktiv) setFotoUrl(url)
    })
    return () => {
      aktiv = false
    }
  }, [receipt?.foto_path])

  const dirty = useMemo(
    () => Boolean(form) && JSON.stringify(form) !== ausgang,
    [form, ausgang],
  )

  // Kopf-Steuerung: Stift (Ansicht) + Zurück-Abfangen (Bearbeiten)
  useEffect(() => {
    setKopf({
      aktion:
        modus === 'ansicht' && receipt ? (
          <button
            type="button"
            aria-label="Eintrag bearbeiten"
            onClick={() => setModus('bearbeiten')}
            className="flex h-12 w-12 items-center justify-center text-brand"
          >
            <Pencil className="h-5 w-5" strokeWidth={2} />
          </button>
        ) : null,
      onZurueck: () => {
        if (modus === 'bearbeiten') {
          if (dirty) setVerwerfenDialog(true)
          else setModus('ansicht')
          return true
        }
        return false
      },
    })
    return () => setKopf({})
  }, [setKopf, modus, dirty, receipt])

  // Anzeige-Werte: Ansicht aus receipt, Bearbeiten live aus form
  const betragZahl =
    modus === 'bearbeiten' && form ? (parseDeZahl(form.betrag) ?? 0) : (receipt?.betrag ?? 0)
  const weicherBetrag = useWeicheZahl(betragZahl, 0.3)

  function setF(patch: Partial<Formular>) {
    setForm((f) => (f ? { ...f, ...patch } : f))
    // Fehler-Markierung verschwindet, sobald das Feld bearbeitet wird
    const keys = Object.keys(patch)
    setFehler((alt) => {
      const neu = { ...alt }
      for (const k of keys) delete neu[k]
      return neu
    })
  }

  function abbrechen() {
    if (!receipt) return
    const f = formularAus(receipt)
    setForm(f)
    setAusgang(JSON.stringify(f))
    setFehler({})
    setKmEditor(false)
    setModus('ansicht')
  }

  function kmAnpassen() {
    if (modus === 'ansicht') {
      setModus('bearbeiten')
      setKmEditor(true)
    } else {
      setKmEditor((o) => !o)
    }
  }

  async function kmAutomatisch() {
    if (!form) return
    setForm((f) => (f ? { ...f, kmManuell: false } : f))
    setKmLaden(true)
    const erg = await berechneKm(
      {
        strasse: form.strasse || null,
        hausnr: form.hausnr || null,
        plz: form.plz || null,
        ort: form.ort,
      },
      settings ?? {
        home_strasse: null,
        home_plz: null,
        home_ort: null,
        home_lat: null,
        home_lng: null,
      },
    )
    setKmLaden(false)
    if (erg) {
      setForm((f) =>
        f
          ? { ...f, kmText: zahlZuText(erg.kmEinfach, 1), kmQuelle: erg.quelle, kmManuell: false }
          : f,
      )
    } else {
      setForm((f) => (f ? { ...f, kmText: '', kmQuelle: null } : f))
    }
  }

  async function speichern() {
    if (!form || !receipt || !id || speichernLaeuft) return
    const fehl = validiere(form)
    if (Object.keys(fehl).length > 0) {
      setFehler(fehl)
      return
    }
    setSpeichernLaeuft(true)
    try {
      let km_einfach = parseDeZahl(form.kmText)
      let km_quelle: KmQuelle | null = form.kmQuelle
      let km_manuell = form.kmManuell && km_einfach != null
      if (km_manuell) km_quelle = 'manuell'

      const adresseGeaendert =
        form.ort.trim() !== receipt.ort ||
        (form.plz.trim() || null) !== receipt.plz ||
        (form.strasse.trim() || null) !== receipt.strasse ||
        (form.hausnr.trim() || null) !== receipt.hausnr

      // Nicht manuell und Adresse geändert (oder km fehlen) → neu berechnen
      if (!km_manuell && (adresseGeaendert || km_einfach == null)) {
        setKmLaden(true)
        const erg = await berechneKm(
          {
            strasse: form.strasse.trim() || null,
            hausnr: form.hausnr.trim() || null,
            plz: form.plz.trim() || null,
            ort: form.ort.trim(),
          },
          settings ?? {
        home_strasse: null,
        home_plz: null,
        home_ort: null,
        home_lat: null,
        home_lng: null,
      },
        )
        setKmLaden(false)
        if (erg) {
          km_einfach = erg.kmEinfach
          km_quelle = erg.quelle
          km_manuell = false
        } else if (adresseGeaendert) {
          // offline/nicht gefunden → „km wird berechnet …" bis Netz da ist
          km_einfach = null
          km_quelle = null
        }
      }

      const updated = await updateReceipt(id, {
        datum: form.datum,
        anrede: form.anrede,
        vorname: form.vorname.trim() || null,
        nachname: form.nachname.trim(),
        betrag: parseDeZahl(form.betrag) ?? receipt.betrag,
        taetigkeit: form.taetigkeit.trim() || null,
        ort: form.ort.trim(),
        plz: form.plz.trim() || null,
        strasse: form.strasse.trim() || null,
        hausnr: form.hausnr.trim() || null,
        km_einfach,
        km_quelle,
        km_manuell,
      })
      setReceipt(updated)
      const f = formularAus(updated)
      setForm(f)
      setAusgang(JSON.stringify(f))
      setFehler({})
      setKmEditor(false)
      setStempel(true)
      navigator.vibrate?.(15)
    } catch {
      zeigeSnackbar('Speichern fehlgeschlagen — bitte erneut versuchen.')
    } finally {
      setSpeichernLaeuft(false)
    }
  }

  function stempelFertig() {
    setStempel(false)
    setModus('ansicht')
    // Geänderte Werte blitzen kurz in brand-green-soft auf (600 ms)
    flashControls.start({
      backgroundColor: ['#E3EDE5', 'rgba(227,237,229,0)'],
      transition: { duration: 0.6, ease: 'easeOut' },
    })
  }

  async function loeschen() {
    if (!receipt || !id) return
    setLoeschDialog(false)
    try {
      await deleteReceipt(id)
      if (receipt.foto_path) await deleteBelegFoto(receipt.foto_path)
      zeigeSnackbar('Eintrag gelöscht')
      navigate('/')
    } catch {
      zeigeSnackbar('Löschen fehlgeschlagen — bitte erneut versuchen.')
    }
  }

  // ---------- Lade- / Fehler-Zustände ----------

  if (laden) {
    return (
      <div className="flex justify-center py-24" aria-label="Eintrag wird geladen">
        <motion.span
          className="h-2 w-24 rounded-full bg-brand"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1, repeat: Infinity }}
        />
      </div>
    )
  }

  if (!receipt || !form) {
    return (
      <EmptyState
        titel="Eintrag nicht gefunden"
        text="Diese Quittung existiert nicht (mehr)."
        aktion={<SekundarButton onClick={() => navigate('/')}>Zur Liste</SekundarButton>}
      />
    )
  }

  // ---------- Abgeleitete Anzeige-Werte ----------

  const quellwerte = modus === 'bearbeiten' ? form : formularAus(receipt)
  const name = nameMit(quellwerte.anrede, quellwerte.vorname, quellwerte.nachname)
  const datumLang = quellwerte.datum
    ? format(parseDatum(quellwerte.datum), 'EEEE, d. MMMM yyyy', { locale: de })
    : ''
  const adresse = [quellwerte.strasse, quellwerte.hausnr].filter(Boolean).join(' ')
  const ortZeile = [quellwerte.plz, quellwerte.ort].filter(Boolean).join(' ')
  const kmEinfachAnzeige =
    modus === 'bearbeiten' ? parseDeZahl(form.kmText) : receipt.km_einfach
  const kmQuelleAnzeige = modus === 'bearbeiten' ? form.kmQuelle : receipt.km_quelle
  const kmManuellAnzeige = modus === 'bearbeiten' ? form.kmManuell : receipt.km_manuell
  const speichernDeaktiviert = !dirty || Object.keys(validiere(form)).length > 0
  // Validierung wie neu.md: leere Pflichtfelder bekommen warn-Rahmen + „Bitte ausfüllen".
  // Der Speichern-Button ist in dem Fall ohnehin disabled — die Markierung erscheint
  // daher live, sobald ein Pflichtfeld geleert wird (dirty), plus nach Speichern-Versuch.
  const anzeigeFehler: Record<string, boolean> =
    modus === 'bearbeiten' ? { ...(dirty ? validiere(form) : {}), ...fehler } : {}

  const fakten: Array<{ label: string; wert: string }> = []
  if (receipt.taetigkeit) fakten.push({ label: 'Tätigkeit', wert: receipt.taetigkeit })
  fakten.push({ label: 'Ort', wert: ortZeile })
  if (adresse) fakten.push({ label: 'Adresse', wert: adresse })

  const erfasstAm = format(new Date(receipt.created_at), 'dd.MM.yyyy', { locale: de })
  const erfasstUm = format(new Date(receipt.created_at), 'HH:mm', { locale: de })

  // ---------- Render ----------

  return (
    <div className="relative mx-auto w-full max-w-[640px] px-5 pt-6 lg:grid lg:grid-cols-[240px_1fr] lg:items-start lg:gap-x-6 lg:px-0">
      {/* Aufblitz-Fläche nach dem Speichern (600 ms) */}
      <motion.div
        animate={flashControls}
        initial={false}
        className="pointer-events-none absolute inset-0 rounded-2xl"
        aria-hidden="true"
      />

      {/* Kopf-Block: bleibt über beide Modi stabil (Layout-Animation) */}
      <motion.header
        className="relative lg:col-span-2"
        initial={{ opacity: 0, y: reduced ? 0 : 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: 'easeOut' }}
      >
        <p className="tabular text-[30px] font-bold leading-tight text-ink">
          {formatEUR(weicherBetrag)}
        </p>
        <p className="mt-1 text-[17px] text-ink">{name}</p>
        <p className="mt-0.5 text-[15px] text-ink-soft">{datumLang}</p>
      </motion.header>

      {/* Heftlinie */}
      <div className="relative my-4 border-t border-line lg:col-span-2" aria-hidden="true" />

      <AnimatePresence mode="wait" initial={false}>
        {modus === 'ansicht' ? (
          <motion.div
            key="ansicht"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="relative lg:col-start-2 lg:row-start-3"
          >
            {/* Fakten-Liste (gestaffelt) */}
            <dl className="space-y-3">
              {fakten.map((f, i) => (
                <motion.div
                  key={f.label}
                  initial={{ opacity: 0, y: reduced ? 0 : 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, ease: 'easeOut', delay: 0.05 * i }}
                >
                  <dt className="text-[15px] text-ink-soft">{f.label}</dt>
                  <dd className="text-[17px] text-ink">{f.wert}</dd>
                </motion.div>
              ))}
            </dl>

            <div className="mt-4">
              <KmBlock
                bearbeiten={false}
                kmEinfach={kmEinfachAnzeige}
                kmQuelle={kmQuelleAnzeige}
                kmManuell={kmManuellAnzeige}
                kmLaden={kmLaden}
                ort={receipt.ort}
                adresse={adresse}
                editorOffen={false}
                kmText=""
                onAnpassen={kmAnpassen}
                onKmText={() => {}}
                onAutomatisch={() => {}}
              />
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="bearbeiten"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="relative space-y-4 lg:col-start-2 lg:row-start-3"
          >
            {/* Formular (Komponenten wie neu.md §2) */}
            <TextField
              label="Datum *"
              type="date"
              value={form.datum}
              onChange={(e) => setF({ datum: e.target.value })}
              warn={Boolean(anzeigeFehler.datum)}
              hinweis={anzeigeFehler.datum ? 'Bitte ausfüllen' : undefined}
            />
            <AnredeSegmente
              label="Anrede *"
              value={form.anrede}
              onChange={(wert) => setF({ anrede: wert })}
            />
            <TextField
              label="Nachname *"
              value={form.nachname}
              onChange={(e) => setF({ nachname: e.target.value })}
              placeholder="z. B. Schmitt"
              warn={Boolean(anzeigeFehler.nachname)}
              hinweis={anzeigeFehler.nachname ? 'Bitte ausfüllen' : undefined}
            />
            <TextField
              label="Vorname"
              value={form.vorname}
              onChange={(e) => setF({ vorname: e.target.value })}
              placeholder="z. B. Beate"
            />
            {/* Betrag mit €-Suffix */}
            <div>
              <label htmlFor="betrag" className="mb-1 block text-[15px] text-ink-soft">
                Betrag *
              </label>
              <div className="relative">
                <input
                  id="betrag"
                  inputMode="decimal"
                  value={form.betrag}
                  onChange={(e) => setF({ betrag: e.target.value })}
                  placeholder="0,00"
                  className={cn(
                    'tabular h-14 w-full rounded-xl border bg-paper-raised px-4 pr-12 text-[17px] text-ink',
                    'placeholder:text-ink-soft focus:outline-none focus:border-brand focus:shadow-[0_0_0_1px_#1E5B43]',
                    anzeigeFehler.betrag ? 'border-warn border-b-2' : 'border-line',
                  )}
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[17px] text-ink-soft">
                  €
                </span>
              </div>
              {anzeigeFehler.betrag && <p className="mt-1 text-[13px] text-warn">Bitte ausfüllen</p>}
            </div>
            <TextField
              label="Ort *"
              value={form.ort}
              onChange={(e) => setF({ ort: e.target.value })}
              placeholder="z. B. Giebelstadt"
              warn={Boolean(anzeigeFehler.ort)}
              hinweis={anzeigeFehler.ort ? 'Bitte ausfüllen' : undefined}
            />
            <TextField
              label="PLZ"
              inputMode="numeric"
              maxLength={5}
              value={form.plz}
              onChange={(e) => setF({ plz: e.target.value })}
            />
            <div className="grid grid-cols-3 gap-2">
              <TextField
                label="Straße"
                containerClassName="col-span-2"
                value={form.strasse}
                onChange={(e) => setF({ strasse: e.target.value })}
              />
              <TextField
                label="Hausnr."
                value={form.hausnr}
                onChange={(e) => setF({ hausnr: e.target.value })}
              />
            </div>
            <p className="flex items-center gap-1.5 text-[13px] text-ink-soft">
              <Route className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Mit Straße wird die Fahrtstrecke exakt berechnet — sonst geschätzt zum
              Ortsmittelpunkt.
            </p>
            <TextField
              label="Tätigkeit"
              value={form.taetigkeit}
              onChange={(e) => setF({ taetigkeit: e.target.value })}
              placeholder="z. B. Fußpflege"
            />

            <KmBlock
              bearbeiten
              kmEinfach={kmEinfachAnzeige}
              kmQuelle={kmQuelleAnzeige}
              kmManuell={kmManuellAnzeige}
              kmLaden={kmLaden}
              ort={form.ort}
              adresse={adresse}
              editorOffen={kmEditor}
              kmText={form.kmText}
              onAnpassen={kmAnpassen}
              onKmText={(t) => setF({ kmText: t, kmManuell: true })}
              onAutomatisch={kmAutomatisch}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Belegfoto (nur wenn vorhanden) — Desktop: linke Spalte */}
      {receipt.quelle === 'foto' && fotoUrl && (
        <motion.div
          className="relative mt-6 lg:col-start-1 lg:row-start-3 lg:mt-0"
          initial={{ opacity: 0, y: reduced ? 0 : 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut', delay: 0.1 }}
        >
          <p className="mb-1 text-[15px] text-ink-soft">Belegfoto</p>
          <button
            type="button"
            onClick={() => setLightbox(true)}
            aria-label="Belegfoto vergrößern"
            className="block w-full"
          >
            <img
              src={fotoUrl}
              alt="Belegfoto der Quittung"
              className="max-h-[220px] w-full rounded-xl border border-line object-cover"
            />
          </button>
        </motion.div>
      )}

      {/* Meta + Aktionen */}
      <div className="relative mt-6 lg:col-span-2">
        <p className="text-[13px] italic text-ink-soft">
          Erfasst am {erfasstAm} um {erfasstUm} Uhr · Quelle:{' '}
          {receipt.quelle === 'foto' ? 'Foto' : 'Von Hand'}
        </p>

        <div className="flex flex-col gap-3 py-6">
          {modus === 'ansicht' ? (
            <>
              <SekundarButton
                onClick={() => setModus('bearbeiten')}
                icon={<Pencil className="h-5 w-5" strokeWidth={2} />}
              >
                Bearbeiten
              </SekundarButton>
              <button
                type="button"
                onClick={() => setLoeschDialog(true)}
                className="flex h-12 items-center justify-center gap-2 text-[15px] font-bold text-danger"
              >
                <Trash2 className="h-4 w-4" strokeWidth={2} />
                Eintrag löschen
              </button>
            </>
          ) : (
            <>
              <PrimarButton
                onClick={speichern}
                disabled={speichernDeaktiviert}
                loading={speichernLaeuft}
                icon={<Check className="h-5 w-5" strokeWidth={2} />}
              >
                Speichern
              </PrimarButton>
              <SekundarButton onClick={abbrechen}>Abbrechen</SekundarButton>
            </>
          )}
        </div>
      </div>

      {/* Lösch-Dialog (immer mit Rückfrage) */}
      <ConfirmDialog
        offen={loeschDialog}
        titel="Eintrag löschen?"
        gefahr
        bestaetigenLabel="Endgültig löschen"
        abbrechenLabel="Behalten"
        onBestaetigen={loeschen}
        onAbbrechen={() => setLoeschDialog(false)}
      >
        <p className="text-[17px] text-ink">
          Die Quittung von {name} über {formatEUR(receipt.betrag)} wird endgültig entfernt.
          {receipt.foto_path ? ' Das Belegfoto wird ebenfalls gelöscht.' : ''}
        </p>
      </ConfirmDialog>

      {/* Verwerfen-Dialog bei ungespeicherten Änderungen + Zurück */}
      <ConfirmDialog
        offen={verwerfenDialog}
        titel="Änderungen verwerfen?"
        bestaetigenLabel="Verwerfen"
        abbrechenLabel="Weiter bearbeiten"
        onBestaetigen={() => {
          setVerwerfenDialog(false)
          navigate(-1)
        }}
        onAbbrechen={() => setVerwerfenDialog(false)}
      />

      {/* Stempel-Animation nach dem Speichern */}
      <StampOverlay sichtbar={stempel} onFertig={stempelFertig} />

      {/* Foto-Lightbox */}
      {fotoUrl && <Lightbox url={fotoUrl} offen={lightbox} onSchliessen={() => setLightbox(false)} />}
    </div>
  )
}
