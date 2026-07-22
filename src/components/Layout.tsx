// App-Shell (design.md §3) — responsive Umschaltung:
// Mobile (< 1024 px): Navbar (Header) + Inhalt + Footer (Bottom Bar mit FAB).
// Desktop (≥ 1024 px): linke Sidebar (260 px) mit Nav + „+ Neuer Eintrag"-Button,
// Inhalt zentriert, max. 960 px.
// Zusätzlich: Login-Gate, Onboarding-Gate (Overlay bei fehlenden Settings),
// dezenter Demo-Modus-Banner, Safe-Area-Insets.

import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'framer-motion'
import { BarChart3, ChevronLeft, List, Plus, Settings as SettingsIcon } from 'lucide-react'
import Navbar from './Navbar'
import Footer from './Footer'
import Onboarding from '@/pages/Onboarding'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'

function DemoBanner() {
  return (
    <div className="bg-brand-soft px-5 py-1.5 text-center text-[13px] text-brand">
      Demo-Modus — Daten bleiben auf diesem Gerät
    </div>
  )
}

const NAV = [
  { zu: '/', label: 'Einträge', icon: List },
  { zu: '/auswertung', label: 'Auswertung', icon: BarChart3 },
  { zu: '/einstellungen', label: 'Einstellungen', icon: SettingsIcon },
]

/** Desktop-Sidebar (≥ 1024 px, 260 px) */
function Sidebar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[260px] flex-col border-r border-line bg-paper-raised lg:flex">
      <Link to="/" className="flex items-center gap-2.5 px-6 pb-6 pt-8">
        <img src="/logo-mark.svg" alt="" className="h-9 w-9" />
        <span className="flex flex-col">
          <span className="font-serif text-[22px] leading-tight text-ink">QuittyPro</span>
          <span className="font-hand text-[17px] leading-tight text-brand">für Paula</span>
        </span>
      </Link>
      <nav className="flex flex-col gap-1 px-3" aria-label="Hauptnavigation">
        {NAV.map(({ zu, label, icon: Icon }) => {
          const aktiv = zu === '/' ? pathname === '/' : pathname.startsWith(zu)
          return (
            <Link
              key={zu}
              to={zu}
              aria-current={aktiv ? 'page' : undefined}
              className={cn(
                'flex h-12 items-center gap-3 rounded-xl px-4 text-[17px] transition-colors duration-150',
                aktiv ? 'bg-brand-soft font-bold text-brand' : 'text-ink hover:bg-brand-soft/50',
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={2} />
              {label}
            </Link>
          )
        })}
      </nav>
      <div className="mt-auto p-4 pb-8">
        <motion.button
          type="button"
          onClick={() => navigate('/neu')}
          whileTap={{ scale: 0.97 }}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-brand text-[17px] font-bold text-white"
        >
          <Plus className="h-5 w-5" strokeWidth={2} />
          Neuer Eintrag
        </motion.button>
      </div>
    </aside>
  )
}

/** Schlichter Kopf für Unterseiten (/neu, /eintrag/:id) — nur Mobile */
function UnterseitenKopf({ titel }: { titel: string }) {
  const navigate = useNavigate()
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-paper pt-safe lg:hidden">
      <div className="flex h-14 items-center px-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Zurück"
          className="flex h-12 w-12 items-center justify-center text-ink"
        >
          <ChevronLeft className="h-6 w-6" strokeWidth={2} />
        </button>
        <h1 className="font-serif text-[20px] text-ink">{titel}</h1>
      </div>
    </header>
  )
}

export default function Layout() {
  const { isLoading, isAuthenticated, isDemoMode, needsOnboarding } = useAuth()
  const { pathname } = useLocation()
  const unterseite = pathname.startsWith('/neu') || pathname.startsWith('/eintrag/')
  const unterseitenTitel = pathname.startsWith('/neu') ? 'Neuer Eintrag' : 'Eintrag'

  if (isLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-paper">
        <img src="/logo-mark.svg" alt="QuittyPro wird geladen …" className="h-16 w-16 opacity-60" />
      </div>
    )
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="min-h-[100dvh] bg-paper">
      <Sidebar />
      <div className="lg:pl-[260px]">
        {isDemoMode && <DemoBanner />}
        {unterseite ? <UnterseitenKopf titel={unterseitenTitel} /> : <Navbar />}
        <main className="mx-auto w-full max-w-[960px] pb-[calc(96px+env(safe-area-inset-bottom))] lg:pb-12">
          <Outlet />
        </main>
        <Footer />
      </div>
      {/* Onboarding-Gate: über der App, bis die Adresse eingetragen ist */}
      <AnimatePresence>{needsOnboarding && <Onboarding />}</AnimatePresence>
    </div>
  )
}
