// Seite: Neuer Eintrag — Route `/neu` (Spec: design/neu.md).
// Orchestriert drei Zustände:
// 1. `vorbereiten` — Foto vorbereiten (Drehen/Zuschneiden/Kontrast) + OCR-Scan-State
//    (erreicht über ?quelle=foto mit Kamera-Foto aus dem AuswahlSheet)
// 2. `formular` — manueller Eintrag (leer) ODER OCR-Bestätigung (vorausgefüllt,
//    unsichere Felder orange) — immer der letzte Schritt vor dem Speichern
// 3. `ocr-fehler` — ruhiger Hinweisblock, wenn die Erkennung nicht verfügbar ist
// Speichern → Stempel-Animation → Liste (neuer Eintrag wird per location.state markiert).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { motion } from 'framer-motion'
import { AlertCircle, Check } from 'lucide-react'
import EintragFormular from '@/components/EintragFormular'
import type { EintragAnfangsWerte, EintragWerte } from '@/components/EintragFormular'
import FotoVorbereiten from '@/components/FotoVorbereiten'
import Lightbox from '@/components/Lightbox'
import { SekundarButton, StampOverlay, useSnackbar } from '@/components/ui-ext'
import { finalisiereBeleg } from '@/lib/bild'
import { createReceipt, uploadBelegFoto } from '@/lib/db'
import { nimmKameraFoto } from '@/lib/fotoUebergabe'
import { scanQuittung } from '@/lib/ocr'
import type { OcrResult } from '@/lib/types'

type Phase = 'formular' | 'vorbereiten' | 'ocr-fehler'

/** OCR-Feldnamen → Formular-Feldnamen (betrag_gesamt → betrag, Rest identisch). */
function mappeUnsicher(ocr: OcrResult | null): Record<string, boolean> {
  if (!ocr?.unsicher) return {}
  const out: Record<string, boolean> = {}
  for (const [feld, wert] of Object.entries(ocr.unsicher)) {
    if (!wert) continue
    out[feld === 'betrag_gesamt' ? 'betrag' : feld] = true
  }
  return out
}

export default function Neu() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { zeigeSnackbar } = useSnackbar()

  // Startzustand: Foto-Flow nur, wenn ?quelle=foto und ein Kamera-Foto wartet.
  // Das Foto wird genau einmal aus der Übergabe geholt (danach ist sie leer).
  const [kameraDatei, setKameraDatei] = useState<Blob | null>(() => nimmKameraFoto())
  const [phase, setPhase] = useState<Phase>(() =>
    searchParams.get('quelle') === 'foto' && kameraDatei ? 'vorbereiten' : 'formular',
  )
  const [quelle, setQuelle] = useState<'manuell' | 'foto'>(
    phase === 'vorbereiten' ? 'foto' : 'manuell',
  )
  const [fotoBlob, setFotoBlob] = useState<Blob | null>(null)
  const [fotoUrl, setFotoUrl] = useState<string | null>(null)
  const [ocr, setOcr] = useState<OcrResult | null>(null)
  const [scanAktiv, setScanAktiv] = useState(false)
  const [formSchluessel, setFormSchluessel] = useState(0)
  const [speichern, setSpeichern] = useState(false)
  const [stempel, setStempel] = useState(false)
  const [lightboxOffen, setLightboxOffen] = useState(false)

  const kameraInput = useRef<HTMLInputElement>(null)
  const scanLauf = useRef(0)
  const fotoUrlRef = useRef<string | null>(null)
  const neueEintragId = useRef<string | null>(null)

  // Object-URL für die Foto-Vorschau verwalten (alte URL immer freigeben)
  const setzeFoto = useCallback((blob: Blob | null) => {
    if (fotoUrlRef.current) URL.revokeObjectURL(fotoUrlRef.current)
    fotoUrlRef.current = blob ? URL.createObjectURL(blob) : null
    setFotoUrl(fotoUrlRef.current)
    setFotoBlob(blob)
  }, [])

  useEffect(() => {
    return () => {
      if (fotoUrlRef.current) URL.revokeObjectURL(fotoUrlRef.current)
    }
  }, [])

  // ---------- OCR ----------

  const starteScan = useCallback((bild: Blob) => {
    const lauf = ++scanLauf.current
    setScanAktiv(true)
    scanQuittung(bild)
      .then((ergebnis) => {
        if (lauf !== scanLauf.current) return // abgebrochen
        setOcr(ergebnis)
        setFormSchluessel((k) => k + 1) // Formular mit OCR-Werten neu befüllen
        setPhase('formular')
      })
      .catch(() => {
        if (lauf !== scanLauf.current) return
        setPhase('ocr-fehler')
      })
      .finally(() => {
        if (lauf === scanLauf.current) setScanAktiv(false)
      })
  }, [])

  function handleScanAbbrechen() {
    scanLauf.current++ // laufende Anfrage verwerfen
    setScanAktiv(false)
  }

  function handleWeiter(bild: Blob) {
    setzeFoto(bild)
    starteScan(bild)
  }

  // ---------- Foto neu machen / anhängen ----------

  function handleKameraDatei(datei: File | undefined) {
    if (!datei) return
    setKameraDatei(datei)
    setOcr(null)
    setzeFoto(null)
    setQuelle('foto')
    setPhase('vorbereiten')
  }

  async function handleFotoAnhaengen(datei: File) {
    try {
      setzeFoto(await finalisiereBeleg(datei, false))
      setQuelle('foto') // Eintrag hat ein Belegfoto
    } catch {
      zeigeSnackbar('Das Foto konnte nicht gelesen werden.')
    }
  }

  // ---------- Speichern ----------

  async function speichernEintrag(
    werte: EintragWerte,
    verbleibendeUnsicher: Record<string, boolean>,
  ) {
    setSpeichern(true)
    try {
      let foto_path: string | null = null
      if (fotoBlob) foto_path = await uploadBelegFoto(fotoBlob)
      const gespeichert = await createReceipt({
        datum: werte.datum,
        anrede: werte.anrede,
        vorname: werte.vorname,
        nachname: werte.nachname,
        betrag: werte.betrag,
        taetigkeit: werte.taetigkeit,
        ort: werte.ort,
        plz: werte.plz,
        strasse: werte.strasse,
        hausnr: werte.hausnr,
        km_einfach: werte.kmEinfach,
        km_quelle: werte.kmQuelle,
        km_manuell: false,
        betrag_in_worten: ocr?.felder?.betrag_in_worten ?? null,
        foto_path,
        ocr_unsicher: quelle === 'foto' ? verbleibendeUnsicher : null,
        quelle,
      })
      neueEintragId.current = gespeichert.id
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(15)
      setStempel(true)
    } catch {
      zeigeSnackbar('Speichern fehlgeschlagen — bitte erneut versuchen.')
      setSpeichern(false)
    }
  }

  // ---------- Abgeleitete Formular-Werte ----------

  const anfangsWerte = useMemo<EintragAnfangsWerte>(() => {
    if (!ocr?.felder) return {}
    const f = ocr.felder
    return {
      datum: f.datum ?? undefined,
      anrede: f.anrede ?? null,
      vorname: f.vorname,
      nachname: f.nachname,
      betrag: f.betrag_gesamt,
      taetigkeit: f.taetigkeit,
      ort: f.ort,
    }
  }, [ocr])

  const unsicher = useMemo(() => mappeUnsicher(ocr), [ocr])
  const istBestaetigung = quelle === 'foto' && ocr != null && phase === 'formular'

  // ---------- Render ----------

  if (phase === 'vorbereiten' && kameraDatei) {
    return (
      <FotoVorbereiten
        datei={kameraDatei}
        scanAktiv={scanAktiv}
        onWeiter={handleWeiter}
        onNeuAufnehmen={() => kameraInput.current?.click()}
        onScanAbbrechen={handleScanAbbrechen}
      />
    )
  }

  return (
    <div className="px-5 pt-6 lg:px-0">
      {/* Versteckter Kamera-Input für „Foto neu machen" / „Neu aufnehmen" */}
      <input
        ref={kameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          handleKameraDatei(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      <h1 className="mb-4 hidden font-serif text-[28px] text-ink lg:block">Neuer Eintrag</h1>

      {phase === 'ocr-fehler' ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, ease: 'easeOut' }}
          className="rounded-xl border border-line bg-paper-raised p-4"
        >
          <p className="flex items-center gap-2 text-[17px] font-bold text-ink">
            <AlertCircle className="h-5 w-5 text-warn" strokeWidth={2} />
            Das Foto konnte nicht gelesen werden.
          </p>
          <p className="mt-2 text-[15px] text-ink-soft">
            Du kannst die Quittung trotzdem von Hand eintragen — das Foto bleibt als Beleg
            gespeichert.
          </p>
          <div className="mt-4 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => {
                setOcr(null)
                setFormSchluessel((k) => k + 1)
                setPhase('formular')
              }}
              className="flex h-14 w-full items-center justify-center rounded-xl bg-brand px-6 text-[17px] font-bold text-white"
            >
              Von Hand eintragen
            </button>
            <SekundarButton
              onClick={() => {
                setPhase('vorbereiten')
                if (fotoBlob) starteScan(fotoBlob)
              }}
            >
              Erneut versuchen
            </SekundarButton>
          </div>
        </motion.div>
      ) : (
        <>
          {/* Foto-Bestätigungs-Kopf: kleines Foto + Introzeile */}
          {istBestaetigung && fotoUrl && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
              className="mb-4"
            >
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => setLightboxOffen(true)}
                  aria-label="Belegfoto vergrößern"
                  className="shrink-0 overflow-hidden rounded-lg border border-line"
                >
                  <img src={fotoUrl} alt="Belegfoto" className="h-[90px] w-[120px] object-cover" />
                </button>
                <p className="pt-1 text-[13px] text-ink-soft">Foto antippen zum Vergrößern</p>
              </div>
              <p className="mt-4 text-[17px] text-ink">
                Ich habe das erkannt — bitte kurz prüfen:
              </p>
            </motion.div>
          )}

          <EintragFormular
            key={formSchluessel}
            anfangsWerte={anfangsWerte}
            unsicher={unsicher}
            betragInWorten={ocr?.felder?.betrag_in_worten ?? null}
            fotoUrl={fotoUrl}
            onFotoAnhaengen={fotoUrl ? undefined : handleFotoAnhaengen}
            submitLabel={istBestaetigung ? 'Passt — eintragen' : 'Eintragen'}
            submitIcon={istBestaetigung ? <Check className="h-5 w-5" strokeWidth={2} /> : undefined}
            speichern={speichern}
            onSubmit={speichernEintrag}
          >
            {istBestaetigung && (
              <SekundarButton onClick={() => kameraInput.current?.click()}>
                Foto neu machen
              </SekundarButton>
            )}
          </EintragFormular>
        </>
      )}

      <Lightbox
        quelle={lightboxOffen ? fotoUrl : null}
        onSchliessen={() => setLightboxOffen(false)}
      />
      <StampOverlay
        sichtbar={stempel}
        onFertig={() =>
          navigate('/', { state: neueEintragId.current ? { hervorheben: neueEintragId.current } : undefined })
        }
      />
    </div>
  )
}
