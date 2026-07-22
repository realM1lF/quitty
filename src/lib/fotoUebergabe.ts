// QuittyPro — Übergabe des Kamera-Fotos vom AuswahlSheet an die Route `/neu`.
// History-State überträgt Blobs nicht zuverlässig (Reload verliert sie),
// darum liegt das aktuelle Foto kurzzeitig in diesem Modul-Singleton.

let aktuellesFoto: File | null = null

/** Vom AuswahlSheet aufgerufen, sobald Paula ein Foto aufgenommen hat. */
export function setzeKameraFoto(foto: File): void {
  aktuellesFoto = foto
}

/**
 * Von `/neu` aufgerufen — liefert das Foto genau einmal (danach geleert).
 * Gibt null zurück, wenn kein Foto wartet (z. B. direkter Aufruf der Route).
 */
export function nimmKameraFoto(): File | null {
  const foto = aktuellesFoto
  aktuellesFoto = null
  return foto
}
