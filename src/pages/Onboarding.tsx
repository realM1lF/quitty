// Onboarding-Overlay (onboarding.md) — genau 2 Schritte: Willkommen → Adresse.
// Vollbild paper über der App, kein Überspringen von Schritt 2.
// Abschluss: Adresse speichern + geocodieren (home_lat/home_lng via lib/geo),
// fehlertolerant bei Offline (nach 2 Versuchen trotzdem speichern).

import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { PrimarButton, TextField, useSnackbar } from '@/components/ui-ext'
import { geocode } from '@/lib/geo'
import { saveSettings } from '@/lib/db'
import { useAuth } from '@/lib/auth'

type Status = 'leer' | 'prueft' | 'gefunden' | 'fehler'

export default function Onboarding() {
  const reducedMotion = useReducedMotion()
  const { refreshSettings } = useAuth()
  const { zeigeSnackbar } = useSnackbar()

  const [schritt, setSchritt] = useState<1 | 2>(1)
  const [strasse, setStrasse] = useState('')
  const [hausnr, setHausnr] = useState('')
  const [plz, setPlz] = useState('')
  const [ort, setOrt] = useState('')
  const [status, setStatus] = useState<Status>('leer')
  const [versuche, setVersuche] = useState(0)

  const komplett =
    strasse.trim() !== '' && hausnr.trim() !== '' && plz.trim() !== '' && ort.trim() !== ''

  async function fertig() {
    if (!komplett || status === 'prueft') return
    setStatus('prueft')
    const punkt = await geocode({ strasse: strasse.trim(), hausnr: '', plz: plz.trim(), ort: ort.trim() })
    if (punkt) {
      setStatus('gefunden')
      await saveSettings({
        home_strasse: `${strasse.trim()} ${hausnr.trim()}`,
        home_plz: plz.trim(),
        home_ort: ort.trim(),
        home_lat: punkt.lat,
        home_lng: punkt.lng,
        onboarded: true,
      })
      await refreshSettings()
      zeigeSnackbar('Willkommen an Bord, Paula!')
      return
    }
    // Fehlertolerant: nach 2 Versuchen (z. B. offline) trotzdem speichern
    const n = versuche + 1
    setVersuche(n)
    if (n >= 2) {
      await saveSettings({
        home_strasse: `${strasse.trim()} ${hausnr.trim()}`,
        home_plz: plz.trim(),
        home_ort: ort.trim(),
        onboarded: true,
      })
      await refreshSettings()
      zeigeSnackbar('Adresse gespeichert — Strecken werden berechnet, sobald du online bist.')
      return
    }
    setStatus('fehler')
  }

  const slideX = reducedMotion ? 0 : 24

  return (
    <motion.div
      className="fixed inset-0 z-[100] overflow-y-auto bg-paper"
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      role="dialog"
      aria-modal="true"
      aria-label="Willkommen bei QuittyPro"
    >
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[420px] flex-col px-6 pb-8 pt-safe lg:max-w-[480px]">
        <AnimatePresence mode="wait" initial={false}>
          {schritt === 1 ? (
            <motion.div
              key="schritt-1"
              initial={{ opacity: 0, x: slideX }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -slideX }}
              transition={{ duration: 0.24, ease: 'easeOut' }}
              className="flex flex-1 flex-col"
            >
              {/* Logo-Block */}
              <div className="flex flex-col items-center pt-[12%]">
                <motion.img
                  src="/logo-mark.svg"
                  alt=""
                  className="h-[88px] w-[88px]"
                  initial={reducedMotion ? { opacity: 0 } : { scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                />
                <motion.p
                  className="mt-3 font-serif text-[32px] text-ink"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.1 }}
                >
                  QuittyPro
                </motion.p>
                <motion.p
                  className="font-hand text-[24px] text-brand"
                  initial={{ opacity: 0, rotate: -4 }}
                  animate={{ opacity: 1, rotate: 0 }}
                  transition={{ duration: 0.4, delay: 0.3 }}
                >
                  für Paula
                </motion.p>
              </div>

              <motion.h1
                className="mt-8 text-center font-serif text-[26px] text-ink"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, delay: 0.45 }}
              >
                Herzlich willkommen, Paula!
              </motion.h1>
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, delay: 0.6 }}
                className="flex flex-col items-center"
              >
                <p className="mt-3 max-w-[320px] text-center text-[17px] leading-relaxed text-ink">
                  Schön, dass du da bist. Ich führe dein Quittungsbuch: Quittungen fotografieren
                  oder eintragen, Fahrten automatisch berechnen — und am Monatsende ist alles
                  fertig für den Steuerberater.
                </p>
                <img src="/empty-state.svg" alt="" width={240} height={180} className="mt-6" />
              </motion.div>

              <motion.div
                className="mt-auto pt-8"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.24, delay: 0.75 }}
              >
                <div className="mb-4 flex justify-center gap-2" aria-hidden="true">
                  <span className="h-2 w-2 rounded-full bg-brand" />
                  <span className="h-2 w-2 rounded-full bg-line" />
                </div>
                <PrimarButton onClick={() => setSchritt(2)}>Los geht's</PrimarButton>
              </motion.div>
            </motion.div>
          ) : (
            <motion.div
              key="schritt-2"
              initial={{ opacity: 0, x: slideX }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -slideX }}
              transition={{ duration: 0.24, ease: 'easeOut' }}
              className="flex flex-1 flex-col pt-[8%]"
            >
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.24 }}
              >
                <h1 className="font-serif text-[24px] text-ink">Wo startest du deine Fahrten?</h1>
                <p className="mt-2 text-[17px] text-ink">
                  Damit ich deine Fahrten berechnen kann, brauche ich deine Adresse — sie bleibt
                  privat und ist nur für die Strecken da.
                </p>
              </motion.div>

              <motion.div
                className="mt-6 flex flex-col gap-4"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.24, delay: 0.08 }}
              >
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

                {/* Status-Zeile */}
                <div className="min-h-[20px] text-[13px]" aria-live="polite">
                  {status === 'prueft' && (
                    <span className="flex items-center gap-2 text-ochre">
                      <motion.span
                        className="h-2 w-2 rounded-full bg-ochre"
                        animate={{ opacity: [0.4, 1, 0.4] }}
                        transition={{ duration: 0.6, repeat: Infinity }}
                      />
                      Adresse wird geprüft …
                    </span>
                  )}
                  {status === 'gefunden' && (
                    <span className="flex items-center gap-2 text-brand">
                      <span className="h-2 w-2 rounded-full bg-brand" />
                      Gefunden!
                    </span>
                  )}
                  {status === 'fehler' && (
                    <span className="text-warn">
                      Adresse nicht gefunden — bitte prüfe die Schreibweise.
                    </span>
                  )}
                </div>
              </motion.div>

              <motion.div
                className="mt-auto pt-8"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.24, delay: 0.15 }}
              >
                <div className="mb-4 flex justify-center gap-2" aria-hidden="true">
                  <span className="h-2 w-2 rounded-full bg-line" />
                  <motion.span
                    className="h-2 w-2 rounded-full"
                    animate={{ backgroundColor: '#1E5B43' }}
                    transition={{ duration: 0.15 }}
                    style={{ backgroundColor: '#1E5B43' }}
                  />
                </div>
                <PrimarButton
                  onClick={fertig}
                  disabled={!komplett}
                  loading={status === 'prueft'}
                >
                  Fertig — Quittungsbuch öffnen
                </PrimarButton>
                <button
                  type="button"
                  onClick={() => setSchritt(1)}
                  className="mt-1 flex h-12 w-full items-center justify-center text-[15px] text-ink-soft"
                >
                  Zurück
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
