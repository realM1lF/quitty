// Zählt einen Zahlenwert weich (easeOut) zum Zielwert — für Count-ups in der
// Auswertung (0 → Ziel, 600 ms) und sanfte Betrags-Übergänge im Detail (300 ms).
// Reduced Motion: Endwert sofort, ohne Animation.

import { useEffect, useRef, useState } from 'react'
import { animate, useReducedMotion } from 'framer-motion'

export function useWeicheZahl(ziel: number, dauer = 0.6, verzoegerung = 0): number {
  const reduced = useReducedMotion()
  const [wert, setWert] = useState(0)
  const displayRef = useRef(0)

  useEffect(() => {
    if (reduced) {
      displayRef.current = ziel
      return
    }
    const controls = animate(displayRef.current, ziel, {
      duration: dauer,
      delay: verzoegerung,
      ease: 'easeOut',
      onUpdate: (v) => {
        displayRef.current = v
        setWert(v)
      },
    })
    return () => controls.stop()
  }, [ziel, dauer, verzoegerung, reduced])

  // Reduced Motion: Endwert sofort, ohne Count-up
  return reduced ? ziel : wert
}
