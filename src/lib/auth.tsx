// QuittyPro — Auth-Kontext.
// Supabase: Magic-Link-Anmeldung (signInWithOtp), Session wird persistiert.
// Demo-Modus (Supabase nicht konfiguriert): automatisch „angemeldet" als lokale Nutzerin.
// Zusätzlich: Onboarding-Gate — solange keine vollständigen Settings
// (home_strasse/home_ort) vorliegen, meldet `needsOnboarding` true und das
// Layout zeigt das Onboarding-Overlay über der App.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { getSettings, isDemoMode, DEMO_USER_ID } from './db'
import type { Settings } from './types'

export interface AuthUser {
  id: string
  email: string | null
}

interface AuthContextValue {
  user: AuthUser | null
  isLoading: boolean
  isAuthenticated: boolean
  isDemoMode: boolean
  settings: Settings | null
  /** true → Onboarding-Overlay anzeigen */
  needsOnboarding: boolean
  refreshSettings: () => Promise<void>
  sendMagicLink: (email: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const DEMO_USER: AuthUser = { id: DEMO_USER_ID, email: null }

function toAuthUser(u: User): AuthUser {
  return { id: u.id, email: u.email ?? null }
}

function settingsComplete(s: Settings | null): boolean {
  return Boolean(s && s.onboarded && s.home_strasse && s.home_ort)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [settings, setSettings] = useState<Settings | null>(null)

  const loadSettings = useCallback(async () => {
    try {
      setSettings(await getSettings())
    } catch {
      setSettings(null)
    }
  }, [])

  useEffect(() => {
    if (isDemoMode || !supabase) {
      // Demo-Modus: sofort „angemeldet"
      setUser(DEMO_USER)
      void loadSettings().finally(() => setIsLoading(false))
      return
    }
    let cancelled = false
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      setUser(data.session?.user ? toAuthUser(data.session.user) : null)
      setIsLoading(false)
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? toAuthUser(session.user) : null)
    })
    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [loadSettings])

  // Settings laden, sobald jemand angemeldet ist
  useEffect(() => {
    if (user) void loadSettings()
    else setSettings(null)
  }, [user, loadSettings])

  const sendMagicLink = useCallback(async (email: string) => {
    if (!supabase) throw new Error('Anmeldung ist im Demo-Modus nicht nötig.')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/login` },
    })
    if (error) throw new Error('Das hat nicht geklappt — bitte versuche es gleich noch einmal.')
  }, [])

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut()
    setUser(isDemoMode ? DEMO_USER : null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: Boolean(user),
      isDemoMode,
      settings,
      needsOnboarding: Boolean(user) && !settingsComplete(settings),
      refreshSettings: loadSettings,
      sendMagicLink,
      signOut,
    }),
    [user, isLoading, settings, loadSettings, sendMagicLink, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth muss innerhalb von <AuthProvider> verwendet werden.')
  return ctx
}
