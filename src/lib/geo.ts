// QuittyPro — Geocoding & Streckenberechnung.
// Geocoding: Nominatim (nur Deutschland, max. 1 Anfrage/Sekunde, Ergebnis-Cache).
// Routing: OSRM (Auto-Profil), km aus Meter-Angabe.
// Distanz-Cache: Supabase-Tabelle `distance_cache` bzw. localStorage im Demo-Modus,
// Schlüssel = normalisierter ziel_key. Fehler/Offline → null (UI zeigt „…").

import { supabase, isSupabaseConfigured } from './supabase'
import type { Settings } from './types'

export interface GeoZiel {
  strasse?: string | null
  hausnr?: string | null
  plz?: string | null
  ort: string
}

export interface KmErgebnis {
  kmEinfach: number
  quelle: 'adresse' | 'ort'
}

interface LatLng {
  lat: number
  lng: number
}

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving'
const LS_GEO_CACHE = 'quittypro:geo_cache'
const LS_DIST_CACHE = 'quittypro:distance_cache'

// In-Memory-Caches (pro Sitzung)
const geoCacheMem = new Map<string, LatLng | null>()
const distCacheMem = new Map<string, KmErgebnis | null>()

// Nominatim-Richtlinie: max. 1 Anfrage pro Sekunde
let lastNominatimAt = 0
async function nominatimThrottle(): Promise<void> {
  const wait = 1000 - (Date.now() - lastNominatimAt)
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastNominatimAt = Date.now()
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Normalisierter Cache-Schlüssel für ein Ziel */
export function zielKey(ziel: GeoZiel): string {
  const adr = ziel.strasse
    ? `${norm(ziel.strasse)} ${norm(ziel.hausnr ?? '')}`
    : 'ortsmittelpunkt'
  return `${adr}|${norm(ziel.plz ?? '')}|${norm(ziel.ort)}`
}

function lsRead(key: string): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>
  } catch {
    return {}
  }
}

function lsWrite(key: string, value: Record<string, unknown>): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Speicher voll o. ä. — Cache ist optional, still ignorieren
  }
}

/**
 * Geocodiert eine Adresse/einen Ort über Nominatim.
 * Gibt null zurück bei Fehler, Offline oder „nicht gefunden".
 */
export async function geocode(ziel: GeoZiel): Promise<LatLng | null> {
  const parts: string[] = []
  const genau = Boolean(ziel.strasse)
  if (ziel.strasse) parts.push(`${ziel.strasse} ${ziel.hausnr ?? ''}`.trim())
  if (ziel.plz) parts.push(ziel.plz)
  parts.push(ziel.ort)
  const query = parts.join(', ')
  const cacheKey = norm(query)

  if (geoCacheMem.has(cacheKey)) return geoCacheMem.get(cacheKey) ?? null
  const ls = lsRead(LS_GEO_CACHE)
  if (cacheKey in ls) {
    const hit = ls[cacheKey] as LatLng | null
    geoCacheMem.set(cacheKey, hit)
    return hit
  }

  try {
    await nominatimThrottle()
    const res = await fetch(
      `${NOMINATIM_URL}?format=json&countrycodes=de&limit=1&q=${encodeURIComponent(query)}`,
      { headers: { Accept: 'application/json' } },
    )
    if (!res.ok) return null
    const json = (await res.json()) as Array<{ lat: string; lon: string }>
    const first = json[0]
    const result: LatLng | null = first
      ? { lat: Number(first.lat), lng: Number(first.lon) }
      : null
    // „Nicht gefunden" nur für Orts-Anfragen cachen; Adressen könnten später gehen
    if (result || !genau) {
      geoCacheMem.set(cacheKey, result)
      lsWrite(LS_GEO_CACHE, { ...ls, [cacheKey]: result })
    }
    return result
  } catch {
    return null
  }
}

/** Fahrstrecke (einfach) in km zwischen zwei Punkten via OSRM. */
async function routeKm(von: LatLng, nach: LatLng): Promise<number | null> {
  try {
    const res = await fetch(
      `${OSRM_URL}/${von.lng},${von.lat};${nach.lng},${nach.lat}?overview=false`,
    )
    if (!res.ok) return null
    const json = (await res.json()) as { routes?: Array<{ distance: number }> }
    const meters = json.routes?.[0]?.distance
    if (typeof meters !== 'number') return null
    return Math.round((meters / 1000) * 10) / 10
  } catch {
    return null
  }
}

async function distCacheLesen(key: string): Promise<KmErgebnis | null> {
  if (distCacheMem.has(key)) return distCacheMem.get(key) ?? null
  if (!isSupabaseConfigured) {
    const hit = (lsRead(LS_DIST_CACHE)[key] as KmErgebnis | undefined) ?? null
    if (hit) distCacheMem.set(key, hit)
    return hit
  }
  try {
    const { data, error } = await supabase!
      .from('distance_cache')
      .select('km_einfach, quelle')
      .eq('ziel_key', key)
      .maybeSingle()
    if (error || !data) return null
    const hit: KmErgebnis = {
      kmEinfach: Number(data.km_einfach),
      quelle: data.quelle === 'adresse' ? 'adresse' : 'ort',
    }
    distCacheMem.set(key, hit)
    return hit
  } catch {
    return null
  }
}

async function distCacheSchreiben(key: string, wert: KmErgebnis): Promise<void> {
  distCacheMem.set(key, wert)
  if (!isSupabaseConfigured) {
    lsWrite(LS_DIST_CACHE, { ...lsRead(LS_DIST_CACHE), [key]: wert })
    return
  }
  try {
    await supabase!
      .from('distance_cache')
      .upsert(
        { ziel_key: key, km_einfach: wert.kmEinfach, quelle: wert.quelle },
        { onConflict: 'ziel_key' },
      )
  } catch {
    // Cache-Schreiben ist best effort
  }
}

/**
 * Berechnet die einfache Fahrstrecke von Paulas Wohnadresse zum Ziel.
 * - Straße vorhanden → exakt zur Adresse (quelle 'adresse')
 * - sonst → geschätzt zum Ortsmittelpunkt (quelle 'ort')
 * Ergebnisse werden gecacht (distance_cache). Bei Fehler/Offline: null.
 * Die Anzeige rechnet Hin + Rück (×2) — hier wird nur die einfache Strecke geliefert.
 */
export async function berechneKm(
  ziel: GeoZiel,
  home: Pick<Settings, 'home_strasse' | 'home_plz' | 'home_ort' | 'home_lat' | 'home_lng'>,
): Promise<KmErgebnis | null> {
  const key = zielKey(ziel)
  const cached = await distCacheLesen(key)
  if (cached) return cached

  // Startpunkt bestimmen
  let von: LatLng | null =
    home.home_lat != null && home.home_lng != null
      ? { lat: home.home_lat, lng: home.home_lng }
      : null
  if (!von && home.home_ort) {
    von = await geocode({
      strasse: home.home_strasse,
      plz: home.home_plz,
      ort: home.home_ort,
    })
  }
  if (!von) return null

  const quelle: 'adresse' | 'ort' = ziel.strasse ? 'adresse' : 'ort'
  const nach = await geocode(ziel)
  if (!nach) return null

  const kmEinfach = await routeKm(von, nach)
  if (kmEinfach == null) return null

  const wert: KmErgebnis = { kmEinfach, quelle }
  await distCacheSchreiben(key, wert)
  return wert
}
