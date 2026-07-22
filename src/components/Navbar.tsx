// Mobiler Header (design.md §3): 56 px + Safe-Area, flächig paper, unten 1 px line.
// Links Logo-Mark + „QuittyPro" (Fraunces 20) + „für Paula" (Caveat 17, brand),
// rechts Zahnrad (48 px Target) → /einstellungen. Nur < 1024 px sichtbar.

import { Link } from 'react-router'
import { Settings } from 'lucide-react'

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-paper pt-safe lg:hidden">
      <div className="flex h-14 items-center justify-between px-5">
        <Link to="/" className="flex items-center gap-2" aria-label="QuittyPro — zur Eintragsliste">
          <img src="/logo-mark.svg" alt="" className="h-7 w-7" />
          <span className="flex items-baseline gap-1.5">
            <span className="font-serif text-[20px] text-ink">QuittyPro</span>
            <span className="font-hand text-[17px] text-brand">für Paula</span>
          </span>
        </Link>
        <Link
          to="/einstellungen"
          aria-label="Einstellungen"
          className="-mr-2 flex h-12 w-12 items-center justify-center text-ink"
        >
          <Settings className="h-6 w-6" strokeWidth={2} />
        </Link>
      </div>
    </header>
  )
}
