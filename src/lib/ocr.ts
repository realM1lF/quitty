// QuittyPro — Beleg-Erkennung (OCR) über die Netlify Function `ocr`.
// Schickt das Foto als base64-JPEG, erhält strukturierte Felder + unsicher-Flags.

import type { OcrResult } from './types'

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      resolve(dataUrl.slice(dataUrl.indexOf(',') + 1))
    }
    reader.onerror = () => reject(new Error('Foto konnte nicht gelesen werden.'))
    reader.readAsDataURL(blob)
  })
}

/**
 * Erkennt die Felder einer PVP-Quittung aus einem Foto.
 * Wirft einen verständlichen Fehler, wenn die Erkennung nicht verfügbar ist
 * (Function fehlt, kein API-Key, Netzwerkfehler).
 */
export async function scanQuittung(photoBlob: Blob): Promise<OcrResult> {
  const image = await blobToBase64(photoBlob)
  let res: Response
  try {
    res = await fetch('/.netlify/functions/ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image }),
    })
  } catch {
    throw new Error('Erkennung nicht verfügbar — bitte trage die Quittung von Hand ein.')
  }
  if (!res.ok) {
    throw new Error('Erkennung nicht verfügbar — bitte trage die Quittung von Hand ein.')
  }
  try {
    return (await res.json()) as OcrResult
  } catch {
    throw new Error('Erkennung nicht verfügbar — bitte trage die Quittung von Hand ein.')
  }
}
