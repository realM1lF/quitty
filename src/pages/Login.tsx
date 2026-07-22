// Login (login.md) — warmer Anmeldescreen per E-Mail Magic Link, ohne App-Shell.
// Erfolgs-Zustand mit Crossfade, 30-s-Sperre für „Erneut senden",
// Magic-Link-Rückkehr mit ruhigem Lade-Zustand.
// Demo-Modus (Supabase nicht konfiguriert): Hinweis + Button „Zur App".

import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Mail } from 'lucide-react'
import { PrimarButton, TextField } from '@/components/ui-ext'
import { useAuth } from '@/lib/auth'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Ruhiger Punkte-Loop für die Magic-Link-Rückkehr */
function PunkteLoop() {
  return (
    <div className="mt-6 flex justify-center gap-2" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-2 w-2 rounded-full bg-line"
          animate={{ backgroundColor: ['#DDD6C4', '#1E5B43', '#DDD6C4'] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.3 }}
        />
      ))}
    </div>
  )
}

export default function Login() {
  const reducedMotion = useReducedMotion()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { isAuthenticated, isLoading, isDemoMode, sendMagicLink, signInWithPassword } = useAuth()

  const [email, setEmail] = useState('')
  const [passwort, setPasswort] = useState('')
  const [passwortModus, setPasswortModus] = useState(false)
  const [gesendet, setGesendet] = useState(false)
  const [laedt, setLaedt] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [sperre, setSperre] = useState(0)

  const istRueckkehr = Boolean(searchParams.get('code'))

  // Countdown für „Erneut senden"
  useEffect(() => {
    if (sperre <= 0) return
    const t = setTimeout(() => setSperre((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [sperre])

  // Im Demo-Modus bleibt die Seite sichtbar (Hinweis + „Zur App"),
  // bei Supabase geht es nach erfolgreicher Anmeldung direkt weiter.
  if (isAuthenticated && !isDemoMode) return <Navigate to="/" replace />

  async function absenden() {
    const adresse = email.trim()
    if (!EMAIL_RE.test(adresse)) {
      setFehler('Bitte eine gültige E-Mail-Adresse eingeben.')
      return
    }
    if (passwortModus && !passwort) {
      setFehler('Bitte dein Passwort eingeben.')
      return
    }
    setFehler(null)
    setLaedt(true)
    try {
      if (passwortModus) {
        await signInWithPassword(adresse, passwort)
      } else {
        await sendMagicLink(adresse)
        setGesendet(true)
        setSperre(30)
      }
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Das hat nicht geklappt — bitte versuche es gleich noch einmal.')
    } finally {
      setLaedt(false)
    }
  }

  // Magic-Link-Rückkehr: Session wird vom Auth-Client aufgebaut
  if (istRueckkehr && !isAuthenticated) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-paper px-6">
        <img src="/logo-mark.svg" alt="" className="h-[72px] w-[72px]" />
        <p className="mt-6 text-center text-[17px] text-ink">
          {isLoading ? 'Einen Moment — du wirst angemeldet …' : 'Einen Moment — du wirst angemeldet …'}
        </p>
        <PunkteLoop />
      </div>
    )
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-paper pb-safe">
      <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col px-6 pt-[12%]">
        {/* Logo-Block */}
        <div className="flex flex-col items-center">
          <motion.img
            src="/logo-mark.svg"
            alt=""
            className="h-[72px] w-[72px]"
            initial={reducedMotion ? { opacity: 0 } : { scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 18 }}
          />
          <motion.h1
            className="mt-3 font-serif text-[30px] text-ink"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            QuittyPro
          </motion.h1>
          <motion.p
            className="translate-x-1 font-hand text-[22px] text-brand"
            initial={{ opacity: 0, rotate: -4 }}
            animate={{ opacity: 1, rotate: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
          >
            für Paula
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, delay: 0.4 }}
          className="flex flex-1 flex-col"
        >
          <p className="mt-2 text-center text-[17px] text-ink-soft">
            Dein Quittungsbuch. Immer dabei.
          </p>

          {isDemoMode ? (
            /* Demo-Modus: keine Anmeldung nötig */
            <div className="mt-10">
              <p className="rounded-xl border border-line bg-paper-raised p-4 text-center text-[15px] text-ink">
                Demo-Modus ist aktiv — deine Daten bleiben auf diesem Gerät.
              </p>
              <div className="mt-4">
                <PrimarButton onClick={() => navigate('/')}>Zur App</PrimarButton>
              </div>
            </div>
          ) : (
            <AnimatePresence mode="wait" initial={false}>
              {gesendet ? (
                <motion.div
                  key="erfolg"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="mt-10 flex flex-col items-center text-center"
                >
                  <motion.div
                    className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-soft"
                    initial={{ scale: 0.5 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                  >
                    <Mail className="h-7 w-7 text-brand" strokeWidth={2} />
                  </motion.div>
                  <h2 className="mt-4 font-serif text-[22px] text-ink">Schau in dein Postfach!</h2>
                  <p className="mt-2 text-[17px] text-ink">
                    Wir haben einen Anmelde-Link an <strong>{email.trim()}</strong> gesendet. Tippe
                    darin auf <strong>Anmelden</strong> — das war's.
                  </p>
                  <p className="mt-2 text-[13px] text-ink-soft">Der Link ist 1 Stunde gültig.</p>
                  <button
                    type="button"
                    disabled={sperre > 0}
                    onClick={absenden}
                    className="mt-4 flex h-12 items-center justify-center px-4 text-[15px] font-bold text-brand disabled:text-ink-soft"
                  >
                    {sperre > 0 ? `Erneut senden (${sperre} s)` : 'Erneut senden'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setGesendet(false)
                      setFehler(null)
                    }}
                    className="flex h-12 items-center justify-center px-4 text-[15px] text-ink-soft"
                  >
                    Andere E-Mail verwenden
                  </button>
                </motion.div>
              ) : (
                <motion.form
                  key="formular"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="mt-10"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void absenden()
                  }}
                >
                  <TextField
                    label="E-Mail-Adresse"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="paula@beispiel.de"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      setFehler(null)
                    }}
                    warn={Boolean(fehler)}
                    hinweis={fehler ?? undefined}
                  />
                  {passwortModus && (
                    <div className="mt-3">
                      <TextField
                        label="Passwort"
                        type="password"
                        autoComplete="current-password"
                        placeholder="Dein Passwort"
                        value={passwort}
                        onChange={(e) => {
                          setPasswort(e.target.value)
                          setFehler(null)
                        }}
                      />
                    </div>
                  )}
                  <div className="mt-3">
                    <PrimarButton type="submit" loading={laedt} icon={<Mail className="h-5 w-5" />}>
                      {laedt
                        ? passwortModus
                          ? 'Wird angemeldet …'
                          : 'Wird gesendet …'
                        : passwortModus
                          ? 'Anmelden'
                          : 'Link zum Anmelden senden'}
                    </PrimarButton>
                  </div>
                  {!passwortModus && (
                    <p className="mt-3 text-center text-[13px] text-ink-soft">
                      Du bekommst eine E-Mail mit einem Anmelde-Link — ganz ohne Passwort.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setPasswortModus((m) => !m)
                      setFehler(null)
                    }}
                    className="mx-auto mt-4 flex h-12 items-center justify-center px-4 text-[13px] text-ink-soft underline decoration-line underline-offset-4"
                  >
                    {passwortModus ? 'Zurück zum Anmelde-Link' : 'Mit Passwort anmelden'}
                  </button>
                </motion.form>
              )}
            </AnimatePresence>
          )}
        </motion.div>
      </div>

      <footer className="pb-4 text-center text-[13px] text-ink-soft">
        QuittyPro · Deine Daten bleiben deine.
      </footer>
    </div>
  )
}
