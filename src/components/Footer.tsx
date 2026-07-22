// Mobile Bottom Bar (design.md §3): 64 px + Safe-Area, paper-raised, oben 1 px line.
// Links Tab „Einträge" → /, Mitte FAB „+" (64 px, 20 px nach oben versetzt),
// rechts Tab „Auswertung" → /auswertung. Aktiv: brand; inaktiv: ink-soft.
// Auf Unterseiten (/neu, /eintrag/:id) bleibt die Bar, der FAB ist ausgeblendet.
// Nur < 1024 px sichtbar (Desktop hat die Sidebar).

import { Link, useLocation, useNavigate } from 'react-router'
import { motion } from 'framer-motion'
import { BarChart3, List, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TabProps {
  zu: string
  label: string
  icon: typeof List
  aktiv: boolean
}

function Tab({ zu, label, icon: Icon, aktiv }: TabProps) {
  return (
    <Link
      to={zu}
      className={cn(
        'flex h-14 flex-1 flex-col items-center justify-center gap-0.5 transition-colors duration-150',
        aktiv ? 'text-brand' : 'text-ink-soft',
      )}
      aria-current={aktiv ? 'page' : undefined}
    >
      <Icon className="h-6 w-6" strokeWidth={2} />
      <span className="text-[13px] font-bold">{label}</span>
    </Link>
  )
}

export default function Footer() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const unterseite = pathname.startsWith('/neu') || pathname.startsWith('/eintrag/')

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-paper-raised pb-safe lg:hidden"
      aria-label="Hauptnavigation"
    >
      <div className="relative flex h-16 items-stretch">
        <Tab zu="/" label="Einträge" icon={List} aktiv={pathname === '/'} />
        {/* Mitte: Platz für den FAB */}
        <div className="relative flex-1">
          {!unterseite && (
            <motion.button
              type="button"
              aria-label="Neuer Eintrag"
              onClick={() => navigate('/neu')}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20, delay: 0.3 }}
              whileTap={{ scale: 0.92 }}
              className="absolute left-1/2 top-0 flex h-16 w-16 -translate-x-1/2 -translate-y-5 items-center justify-center rounded-full bg-brand text-white shadow-fab"
            >
              <Plus className="h-7 w-7" strokeWidth={2} />
            </motion.button>
          )}
        </div>
        <Tab
          zu="/auswertung"
          label="Auswertung"
          icon={BarChart3}
          aktiv={pathname.startsWith('/auswertung')}
        />
      </div>
    </nav>
  )
}
