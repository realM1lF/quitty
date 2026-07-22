// QuittyPro — Bildverarbeitung für Belegfotos (komplett clientseitig via Canvas).
// Pipeline: EXIF-Orientierung anwenden → drehen (90°-Schritte) → zuschneiden →
// skalieren (längste Kante max. 1600 px) → optional Auto-Kontrast → JPEG-Export.
// Die Zwischenschritte (dreheBild/schneideBildZu) arbeiten ohne Skalierung,
// damit die Qualität bis zum finalen Export erhalten bleibt.

/** Maximale Kantenlänge des exportierten Belegfotos (längste Seite). */
export const MAX_KANTE = 1600

const JPEG_QUALITAET = 0.85

/** Normalisierter Bildausschnitt (0–1 relativ zur angezeigten Bildfläche). */
export interface Ausschnitt {
  x: number
  y: number
  w: number
  h: number
}

type BildQuelle = HTMLImageElement | ImageBitmap

/**
 * Lädt ein Blob als Bild und wendet die EXIF-Orientierung an.
 * Moderne Browser drehen beim Zeichnen auf Canvas automatisch korrekt
 * (createImageBitmap mit imageOrientation: 'from-image', Fallback: <img>).
 */
async function ladeBild(blob: Blob): Promise<BildQuelle> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob, { imageOrientation: 'from-image' })
    } catch {
      // ältere WebKit-Versionen: Fallback auf <img>
    }
  }
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    img.decoding = 'async'
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('Das Foto konnte nicht geladen werden.'))
      img.src = url
    })
    return img
  } finally {
    // Das Bild bleibt nach dem Zeichnen nutzbar; die URL kann sofort freigegeben werden.
    URL.revokeObjectURL(url)
  }
}

function breiteHoehe(bild: BildQuelle): { w: number; h: number } {
  if (typeof ImageBitmap !== 'undefined' && bild instanceof ImageBitmap) {
    return { w: bild.width, h: bild.height }
  }
  const img = bild as HTMLImageElement
  return { w: img.naturalWidth, h: img.naturalHeight }
}

function canvasZuJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Das Foto konnte nicht exportiert werden.'))),
      'image/jpeg',
      JPEG_QUALITAET,
    )
  })
}

/**
 * Zeichnet das Bild (EXIF-korrigiert) gedreht und zugeschnitten auf ein Canvas.
 * drehung: 0 | 90 | 180 | 270 (im Uhrzeigersinn).
 * ausschnitt bezieht sich auf das bereits gedrehte Bild (normalisiert).
 */
function zeichne(
  bild: BildQuelle,
  drehung: number,
  ausschnitt: Ausschnitt | null,
  maxKante: number | null,
): HTMLCanvasElement {
  const { w, h } = breiteHoehe(bild)
  const quer = drehung === 90 || drehung === 270
  const gedrehtW = quer ? h : w
  const gedrehtH = quer ? w : h

  // Ausschnitt im gedrehten Koordinatensystem (Pixel)
  const ax = ausschnitt ? Math.round(ausschnitt.x * gedrehtW) : 0
  const ay = ausschnitt ? Math.round(ausschnitt.y * gedrehtH) : 0
  const aw = ausschnitt ? Math.max(1, Math.round(ausschnitt.w * gedrehtW)) : gedrehtW
  const ah = ausschnitt ? Math.max(1, Math.round(ausschnitt.h * gedrehtH)) : gedrehtH

  const faktor = maxKante ? Math.min(1, maxKante / Math.max(aw, ah)) : 1
  const zielW = Math.max(1, Math.round(aw * faktor))
  const zielH = Math.max(1, Math.round(ah * faktor))

  const canvas = document.createElement('canvas')
  canvas.width = zielW
  canvas.height = zielH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas wird nicht unterstützt.')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  // In die Mitte des gedrehten Bildes transformieren, rotieren, Quelle zeichnen.
  ctx.save()
  ctx.scale(zielW / aw, zielH / ah)
  ctx.translate(-ax, -ay)
  ctx.translate(gedrehtW / 2, gedrehtH / 2)
  ctx.rotate((drehung * Math.PI) / 180)
  ctx.drawImage(bild, -w / 2, -h / 2, w, h)
  ctx.restore()
  return canvas
}

/**
 * Auto-Kontrast für den Scan-Modus: Graustufen + Spreizung des Histogramms
 * (1.–99. Perzentil) — Bleistift auf Quittungspapier wird deutlich lesbarer.
 */
export function wendeAutoKontrastAn(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const bildDaten = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = bildDaten.data
  const anzahl = canvas.width * canvas.height
  const helligkeit = new Uint8Array(anzahl)
  const histogramm = new Uint32Array(256)

  for (let i = 0; i < anzahl; i++) {
    const o = i * 4
    const l = Math.round(0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2])
    helligkeit[i] = l
    histogramm[l]++
  }

  // 1 % / 99 % Perzentile als Schwarz-/Weißpunkt
  const untereGrenze = anzahl * 0.01
  const obereGrenze = anzahl * 0.99
  let summe = 0
  let lo = 0
  let hi = 255
  for (let i = 0; i < 256; i++) {
    summe += histogramm[i]
    if (summe >= untereGrenze) {
      lo = i
      break
    }
  }
  summe = 0
  for (let i = 0; i < 256; i++) {
    summe += histogramm[i]
    if (summe >= obereGrenze) {
      hi = i
      break
    }
  }
  if (hi - lo < 24) hi = Math.min(255, lo + 24) // flaches Bild → nicht übersteuern

  const spanne = 255 / (hi - lo)
  for (let i = 0; i < anzahl; i++) {
    let v = Math.round((helligkeit[i] - lo) * spanne)
    if (v < 0) v = 0
    else if (v > 255) v = 255
    const o = i * 4
    d[o] = v
    d[o + 1] = v
    d[o + 2] = v
  }
  ctx.putImageData(bildDaten, 0, 0)
}

/** Dreht ein Foto um 90/180/270 Grad (im Uhrzeigersinn), ohne Qualitätsverlust durch Skalierung. */
export async function dreheBild(quelle: Blob, grad: 90 | 180 | 270): Promise<Blob> {
  const bild = await ladeBild(quelle)
  const canvas = zeichne(bild, grad, null, null)
  return canvasZuJpeg(canvas)
}

/** Schneidet ein Foto auf den normalisierten Ausschnitt zu (ohne Skalierung). */
export async function schneideBildZu(quelle: Blob, ausschnitt: Ausschnitt): Promise<Blob> {
  const bild = await ladeBild(quelle)
  const canvas = zeichne(bild, 0, ausschnitt, null)
  return canvasZuJpeg(canvas)
}

/**
 * Finaler Export fürs Hochladen: längste Kante max. 1600 px, optional Auto-Kontrast,
 * JPEG (Qualität 0.85) — klein genug für Upload + OCR, scharf genug als Beleg.
 */
export async function finalisiereBeleg(quelle: Blob, kontrast = false): Promise<Blob> {
  const bild = await ladeBild(quelle)
  const canvas = zeichne(bild, 0, null, MAX_KANTE)
  if (kontrast) wendeAutoKontrastAn(canvas)
  return canvasZuJpeg(canvas)
}
