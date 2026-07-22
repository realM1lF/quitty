// EintragFormular (neu.md §2 + §3.2) — gemeinsames Formular für:
// - manuellen Eintrag (leer, Datum = heute, „Eintragen")
// - Foto-Bestätigung (mit OCR-Werten vorausgefüllt, unsichere Felder orange, „Passt — eintragen")
//
// Enthält: Pflichtfeld-Validierung (warn-Rahmen + „Bitte ausfüllen"), Betrag mit €-Suffix
// (Komma-Eingabe), km-Vorschau (grün exakt / ochre geschätzt, Hin + Rück), Belegfoto-Thumb
// mit Lightbox bzw. optionaler Anhängen-Button im manuellen Modus.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { AlertCircle, Paperclip, Route } from 'lucide-react'
import { AnredeSegmente, PrimarButton, TextField } from './ui-ext'
import Lightbox from './Lightbox'
import { berechneKm } from '@/lib/geo'
import type { KmErgebnis } from '@/lib/geo'
import { getSettings } from '@/lib/db'
import { formatKm } from '@/lib/format'
import type { Anrede, KmQuelle, Settings } from '@/lib/types'
import { cn } from '@/lib/utils'

/** Felder, die als unsicher markiert werden können (OCR) bzw. Pflichtfelder sind. */
export type FeldName =
  | 'datum'
  | 'anrede'
  | 'nachname'
  | 'betrag'
  | 'ort'
  | 'vorname'
  | 'taetigkeit'

/** Anfangswerte (alle optional — OCR füllt nur, was erkannt wurde). */
export interface EintragAnfangsWerte {
  datum?: string
  anrede?: Anrede | null
  vorname?: string | null
  nachname?: string | null
  betrag?: number | null
  taetigkeit?: string | null
  ort?: string | null
  plz?: string | null
  strasse?: string | null
  hausnr?: string | null
}

/** Geprüfte Werte, die beim Submit an die Seite gehen. */
export interface EintragWerte {
  datum: string
  anrede: Anrede
  vorname: string | null
  nachname: string
  betrag: number
  taetigkeit: string | null
  ort: string
  plz: string | null
  strasse: string | null
  hausnr: string | null
  /** einfache Strecke (Anzeige rechnet ×2); null, wenn nicht berechenbar */
  kmEinfach: number | null
  kmQuelle: KmQuelle | null
}

interface Props {
  anfangsWerte?: EintragAnfangsWerte
  /** OCR-Unsicherheiten: Feldname → true. Verschwindet beim Bearbeiten des Feldes. */
  unsicher?: Record<string, boolean>
  /** erkannter Betrag in Worten — wird im warn-Hinweis des Betragsfelds gezeigt */
  betragInWorten?: string | null
  /** Vorschaubild (88×66) des Belegfotos; antippbar → Lightbox */
  fotoUrl?: string | null
  /** wenn gesetzt: „Belegfoto anhängen"-Button (manueller Modus) */
  onFotoAnhaengen?: (datei: File) => void
  submitLabel: string
  submitIcon?: ReactNode
  speichern?: boolean
  onSubmit: (werte: EintragWerte, verbleibendeUnsicher: Record<string, boolean>) => void
  /** zusätzliche Buttons unter dem Primär-Button (z. B. „Foto neu machen") */
  children?: ReactNode
}

function heute(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const tt = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${tt}`
}

/** „32,5" / „32.50" / „1.234,56" → number; null bei ungültiger Eingabe. */
function parseBetrag(text: string): number | null {
  const t = text.trim().replace(/\s/g, '')
  if (!t) return null
  const normalisiert = t.includes(',')
    ? t.replace(/\./g, '').replace(',', '.')
    : t
  const wert = Number(normalisiert)
  return Number.isFinite(wert) ? wert : null
}

/** 32 → „32,00" (für die Vorbefüllung aus der OCR) */
function betragZuText(betrag: number | null | undefined): string {
  if (betrag == null) return ''
  return betrag.toFixed(2).replace('.', ',')
}

type KmStatus =
  | { zustand: 'leer' }
  | { zustand: 'laedt' }
  | { zustand: 'fertig'; wert: KmErgebnis }
  | { zustand: 'fehler' }

const BLOCK_VARIANTEN = {
  versteckt: { opacity: 0, y: 14 },
  sichtbar: { opacity: 1, y: 0 },
}

export default function EintragFormular({
  anfangsWerte,
  unsicher,
  betragInWorten,
  fotoUrl,
  onFotoAnhaengen,
  submitLabel,
  submitIcon,
  speichern,
  onSubmit,
  children,
}: Props) {
  const [datum, setDatum] = useState(anfangsWerte?.datum ?? heute())
  const [anrede, setAnrede] = useState<Anrede | null>(anfangsWerte?.anrede ?? null)
  const [nachname, setNachname] = useState(anfangsWerte?.nachname ?? '')
  const [vorname, setVorname] = useState(anfangsWerte?.vorname ?? '')
  const [betragText, setBetragText] = useState(betragZuText(anfangsWerte?.betrag))
  const [ort, setOrt] = useState(anfangsWerte?.ort ?? '')
  const [plz, setPlz] = useState(anfangsWerte?.plz ?? '')
  const [strasse, setStrasse] = useState(anfangsWerte?.strasse ?? '')
  const [hausnr, setHausnr] = useState(anfangsWerte?.hausnr ?? '')
  const [taetigkeit, setTaetigkeit] = useState(anfangsWerte?.taetigkeit ?? '')

  // OCR-Unsicherheiten — lokale Kopie, Eintrag verschwindet beim Bearbeiten
  const [unsicherAktiv, setUnsicherAktiv] = useState<Record<string, boolean>>(() => ({
    ...(unsicher ?? {}),
  }))
  // Validierungsfehler werden erst nach dem ersten Submit-Versuch gezeigt
  const [validierungSichtbar, setValidierungSichtbar] = useState(false)

  const [km, setKm] = useState<KmStatus>({ zustand: 'leer' })
  const settingsRef = useRef<Settings | null>(null)
  const settingsGeladen = useRef(false)
  const [lightboxOffen, setLightboxOffen] = useState(false)
  const anhangInput = useRef<HTMLInputElement>(null)

  const loescheUnsicher = useCallback((feld: FeldName) => {
    setUnsicherAktiv((prev) => {
      if (!prev[feld]) return prev
      const next = { ...prev }
      delete next[feld]
      return next
    })
  }, [])

  // Settings (Home-Adresse) einmalig laden
  useEffect(() => {
    if (settingsGeladen.current) return
    settingsGeladen.current = true
    getSettings()
      .then((s) => {
        settingsRef.current = s
      })
      .catch(() => {
        settingsRef.current = null
      })
  }, [])

  // km-Vorschau: debounced neu berechnen, sobald Ort/Adresse sich ändert
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!ort.trim()) {
        setKm({ zustand: 'leer' })
        return
      }
      setKm({ zustand: 'laedt' })
      const home = settingsRef.current
      if (!home || (!home.home_ort && home.home_lat == null)) {
        setKm({ zustand: 'fehler' })
        return
      }
      berechneKm(
        { strasse: strasse.trim() || null, hausnr: hausnr.trim() || null, plz: plz.trim() || null, ort: ort.trim() },
        home,
      )
        .then((wert) => setKm(wert ? { zustand: 'fertig', wert } : { zustand: 'fehler' }))
        .catch(() => setKm({ zustand: 'fehler' }))
    }, 700)
    return () => clearTimeout(timer)
  }, [ort, strasse, hausnr, plz])

  const betrag = useMemo(() => parseBetrag(betragText), [betragText])

  const fehler = useMemo(() => {
    const f: Partial<Record<FeldName, boolean>> = {}
    if (!datum) f.datum = true
    if (!anrede) f.anrede = true
    if (!nachname.trim()) f.nachname = true
    if (betrag == null || betrag <= 0) f.betrag = true
    if (!ort.trim()) f.ort = true
    return f
  }, [datum, anrede, nachname, betrag, ort])

  const formularGueltig = Object.keys(fehler).length === 0

  function zeigeWarn(feld: FeldName): boolean {
    return Boolean(unsicherAktiv[feld]) || (validierungSichtbar && Boolean(fehler[feld]))
  }

  function warnHinweis(feld: FeldName): string {
    if (validierungSichtbar && fehler[feld]) return 'Bitte ausfüllen'
    if (feld === 'betrag' && betragInWorten) {
      return `Bitte prüfen — erkannter Betrag in Worten: ‚${betragInWorten} Euro'`
    }
    return 'Bitte prüfen'
  }

  function handleSubmit() {
    if (!formularGueltig) {
      setValidierungSichtbar(true)
      return
    }
    onSubmit(
      {
        datum,
        anrede: anrede!,
        vorname: vorname.trim() || null,
        nachname: nachname.trim(),
        betrag: betrag!,
        taetigkeit: taetigkeit.trim() || null,
        ort: ort.trim(),
        plz: plz.trim() || null,
        strasse: strasse.trim() || null,
        hausnr: hausnr.trim() || null,
        kmEinfach: km.zustand === 'fertig' ? km.wert.kmEinfach : null,
        kmQuelle: km.zustand === 'fertig' ? km.wert.quelle : null,
      },
      unsicherAktiv,
    )
  }

  return (
    <motion.form
      className="flex flex-col gap-4"
      initial="versteckt"
      animate="sichtbar"
      variants={{ sichtbar: { transition: { staggerChildren: 0.05 } } }}
      onSubmit={(e) => {
        e.preventDefault()
        handleSubmit()
      }}
      noValidate
    >
      {/* Belegfoto: Vorschau (88×66) oder Anhängen-Button */}
      {(fotoUrl || onFotoAnhaengen) && (
        <motion.div variants={BLOCK_VARIANTEN} transition={{ duration: 0.22, ease: 'easeOut' }}>
          <span className="mb-1 block text-[15px] text-ink-soft">Belegfoto</span>
          {fotoUrl ? (
            <button
              type="button"
              onClick={() => setLightboxOffen(true)}
              aria-label="Belegfoto vergrößern"
              className="block overflow-hidden rounded-lg border border-line"
            >
              <img src={fotoUrl} alt="Belegfoto" className="h-[66px] w-[88px] object-cover" />
            </button>
          ) : (
            <>
              <input
                ref={anhangInput}
                type="file"
                accept="image/*"
                className="hidden"
                aria-hidden="true"
                tabIndex={-1}
                onChange={(e) => {
                  const datei = e.target.files?.[0]
                  if (datei && onFotoAnhaengen) onFotoAnhaengen(datei)
                  e.target.value = ''
                }}
              />
              <button
                type="button"
                onClick={() => anhangInput.current?.click()}
                className="flex h-12 items-center gap-2 rounded-xl border border-line bg-paper-raised px-4 text-[15px] text-ink"
              >
                <Paperclip className="h-4 w-4 text-ink-soft" strokeWidth={2} />
                Belegfoto anhängen (optional)
              </button>
            </>
          )}
        </motion.div>
      )}

      <motion.div variants={BLOCK_VARIANTEN} transition={{ duration: 0.22, ease: 'easeOut' }}>
        <TextField
          label="Datum *"
          type="date"
          value={datum}
          warn={zeigeWarn('datum')}
          hinweis={zeigeWarn('datum') ? warnHinweis('datum') : undefined}
          onChange={(e) => {
            setDatum(e.target.value)
            loescheUnsicher('datum')
          }}
        />
      </motion.div>

      <motion.div variants={BLOCK_VARIANTEN} transition={{ duration: 0.22, ease: 'easeOut' }}>
        <div
          className={cn(
            'rounded-xl transition-shadow duration-150',
            validierungSichtbar && fehler.anrede && 'shadow-[0_0_0_2px_#C46A1B]',
          )}
        >
          <AnredeSegmente
            value={anrede}
            label="Anrede *"
            onChange={(wert) => {
              setAnrede(wert)
              loescheUnsicher('anrede')
            }}
          />
        </div>
        {zeigeWarn('anrede') && (
          <p className="mt-1 flex items-center gap-1 text-[13px] text-warn">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {warnHinweis('anrede')}
          </p>
        )}
      </motion.div>

      <motion.div variants={BLOCK_VARIANTEN} transition={{ duration: 0.22, ease: 'easeOut' }}>
        <TextField
          label="Nachname *"
          placeholder="z. B. Schmitt"
          autoComplete="family-name"
          value={nachname}
          warn={zeigeWarn('nachname')}
          hinweis={zeigeWarn('nachname') ? warnHinweis('nachname') : undefined}
          onChange={(e) => {
            setNachname(e.target.value)
            loescheUnsicher('nachname')
          }}
        />
      </motion.div>

      <motion.div variants={BLOCK_VARIANTEN} transition={{ duration: 0.22, ease: 'easeOut' }}>
        <TextField
          label="Vorname"
          placeholder="z. B. Beate"
          autoComplete="given-name"
          value={vorname}
          onChange={(e) => setVorname(e.target.value)}
        />
      </motion.div>

      {/* Betrag mit €-Suffix (Komma-Eingabe wird akzeptiert) */}
      <motion.div variants={BLOCK_VARIANTEN} transition={{ duration: 0.22, ease: 'easeOut' }}>
        <label htmlFor="feld-betrag" className="mb-1 block text-[15px] text-ink-soft">
          Betrag *
        </label>
        <div className="relative">
          <input
            id="feld-betrag"
            inputMode="decimal"
            placeholder="0,00"
            value={betragText}
            onChange={(e) => {
              setBetragText(e.target.value)
              loescheUnsicher('betrag')
            }}
            className={cn(
              'tabular h-14 w-full rounded-xl border bg-paper-raised px-4 pr-10 text-[17px] text-ink',
              'placeholder:text-ink-soft',
              'transition-[border-color,box-shadow] duration-150',
              'focus:outline-none focus:border-brand focus:shadow-[0_0_0_1px_#1E5B43]',
              zeigeWarn('betrag') ? 'border-warn border-b-2' : 'border-line',
            )}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-[17px] text-ink-soft"
          >
            €
          </span>
        </div>
        {zeigeWarn('betrag') && (
          <p className="mt-1 flex items-center gap-1 text-[13px] text-warn">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {warnHinweis('betrag')}
          </p>
        )}
      </motion.div>

      <motion.div variants={BLOCK_VARIANTEN} transition={{ duration: 0.22, ease: 'easeOut' }}>
        <TextField
          label="Ort *"
          placeholder="z. B. Giebelstadt"
          value={ort}
          warn={zeigeWarn('ort')}
          hinweis={zeigeWarn('ort') ? warnHinweis('ort') : undefined}
          onChange={(e) => {
            setOrt(e.target.value)
            loescheUnsicher('ort')
          }}
        />
      </motion.div>

      <motion.div variants={BLOCK_VARIANTEN} transition={{ duration: 0.22, ease: 'easeOut' }}>
        <TextField
          label="PLZ"
          inputMode="numeric"
          maxLength={5}
          value={plz}
          onChange={(e) => setPlz(e.target.value.replace(/\D/g, '').slice(0, 5))}
        />
      </motion.div>

      <motion.div variants={BLOCK_VARIANTEN} transition={{ duration: 0.22, ease: 'easeOut' }}>
        <div className="grid grid-cols-[2fr_1fr] gap-3">
          <TextField
            label="Straße"
            value={strasse}
            onChange={(e) => setStrasse(e.target.value)}
          />
          <TextField
            label="Hausnr."
            value={hausnr}
            onChange={(e) => setHausnr(e.target.value)}
          />
        </div>
        <p className="mt-1.5 flex items-start gap-1.5 text-[13px] text-ink-soft">
          <Route className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          Mit Straße wird die Fahrtstrecke exakt berechnet — sonst geschätzt zum Ortsmittelpunkt.
        </p>
      </motion.div>

      <motion.div variants={BLOCK_VARIANTEN} transition={{ duration: 0.22, ease: 'easeOut' }}>
        <TextField
          label="Tätigkeit"
          placeholder="z. B. Fußpflege"
          value={taetigkeit}
          warn={zeigeWarn('taetigkeit')}
          hinweis={zeigeWarn('taetigkeit') ? warnHinweis('taetigkeit') : undefined}
          onChange={(e) => {
            setTaetigkeit(e.target.value)
            loescheUnsicher('taetigkeit')
          }}
        />
      </motion.div>

      {/* km-Vorschau (live, sobald Ort ausgefüllt und Home-Adresse bekannt) */}
      {km.zustand !== 'leer' && km.zustand !== 'fehler' && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="tabular flex items-center gap-2 text-[15px] text-ink"
          aria-live="polite"
        >
          {km.zustand === 'laedt' ? (
            <span className="text-ink-soft">km wird berechnet …</span>
          ) : (
            <>
              <span
                aria-hidden="true"
                className={cn(
                  'h-2.5 w-2.5 shrink-0 rounded-full',
                  km.wert.quelle === 'adresse' ? 'bg-brand' : 'bg-ochre',
                )}
              />
              {km.wert.quelle === 'adresse'
                ? `Fahrtstrecke: ${formatKm(km.wert.kmEinfach * 2)} (Hin- + Rückfahrt)`
                : `~ ${formatKm(km.wert.kmEinfach * 2)} geschätzt (Hin- + Rückfahrt)`}
            </>
          )}
        </motion.p>
      )}

      <div className="flex flex-col gap-3 pb-2 pt-4">
        <PrimarButton
          type="submit"
          disabled={validierungSichtbar && !formularGueltig}
          loading={speichern}
          icon={submitIcon}
        >
          {submitLabel}
        </PrimarButton>
        {children}
      </div>

      <Lightbox
        quelle={lightboxOffen && fotoUrl ? fotoUrl : null}
        onSchliessen={() => setLightboxOffen(false)}
      />
    </motion.form>
  )
}
