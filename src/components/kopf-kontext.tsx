// Steuerung des Unterseiten-Kopfs (Layout.tsx) aus einer Unterseite heraus.
// Eine Unterseite (z. B. /eintrag/:id) kann damit
//  - eine rechte Aktion in den Kopf setzen (z. B. den Bearbeiten-Stift)
//  - den Zurück-Button abfangen (z. B. „Änderungen verwerfen?"-Dialog)
// Registrierung per useEffect; beim Unmount zurücksetzen (setKopf({})).

import { createContext } from 'react'
import type { ReactNode } from 'react'

export interface UnterseitenKopfSteuerung {
  /** Rechte Aktion im Kopf (48-px-Icon-Button) oder null */
  aktion?: ReactNode
  /** Rückgabe true = Zurück wurde behandelt, Layout navigiert NICHT */
  onZurueck?: () => boolean
}

export const UnterseitenKopfContext = createContext<(s: UnterseitenKopfSteuerung) => void>(
  () => {},
)
