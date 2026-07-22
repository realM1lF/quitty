// QuittyPro — einheitliche Datenschicht.
// Wenn Supabase konfiguriert ist (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY),
// werden Postgres (receipts/settings) und Storage (Bucket `belege`) genutzt.
// Sonst läuft ein voll funktionsfähiger lokaler Demo-Modus via localStorage
// mit exakt derselben API — die App ist so sofort testbar.

import { supabase, isSupabaseConfigured } from './supabase'
import type { Receipt, ReceiptFilter, Settings } from './types'

export const isDemoMode = !isSupabaseConfigured

export const DEMO_USER_ID = 'demo-user'

const LS_RECEIPTS = 'quittypro:receipts'
const LS_SETTINGS = 'quittypro:settings'
const LS_FOTOS = 'quittypro:fotos'

// ---------- Hilfsfunktionen ----------

async function currentUserId(): Promise<string> {
  if (!supabase) return DEMO_USER_ID
  const { data } = await supabase.auth.getSession()
  const uid = data.session?.user?.id
  if (!uid) throw new Error('Nicht angemeldet.')
  return uid
}

function now(): string {
  return new Date().toISOString()
}

function uuid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

// ---------- Demo-Modus (localStorage) ----------

function lsReadReceipts(): Receipt[] {
  try {
    return JSON.parse(localStorage.getItem(LS_RECEIPTS) ?? '[]') as Receipt[]
  } catch {
    return []
  }
}

function lsWriteReceipts(rows: Receipt[]): void {
  localStorage.setItem(LS_RECEIPTS, JSON.stringify(rows))
}

function lsReadSettings(): Settings | null {
  try {
    const raw = localStorage.getItem(LS_SETTINGS)
    return raw ? (JSON.parse(raw) as Settings) : null
  } catch {
    return null
  }
}

function lsReadFotos(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(LS_FOTOS) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}

function applyFilter(rows: Receipt[], filter?: ReceiptFilter): Receipt[] {
  let out = rows
  if (filter?.jahr) out = out.filter((r) => r.datum.slice(0, 4) === String(filter.jahr))
  if (filter?.monat) out = out.filter((r) => Number(r.datum.slice(5, 7)) === filter.monat)
  if (filter?.ort) out = out.filter((r) => r.ort.toLowerCase() === filter.ort!.toLowerCase())
  if (filter?.nurGeschaetzteKm) out = out.filter((r) => r.km_quelle === 'ort' && !r.km_manuell)
  if (filter?.suche) {
    const q = filter.suche.trim().toLowerCase()
    if (q) {
      out = out.filter((r) =>
        [r.vorname ?? '', r.nachname, r.ort, r.taetigkeit ?? '']
          .join(' ')
          .toLowerCase()
          .includes(q),
      )
    }
  }
  return out
}

// ---------- Receipts ----------

export async function listReceipts(filter?: ReceiptFilter): Promise<Receipt[]> {
  if (isDemoMode) {
    const rows = applyFilter(lsReadReceipts(), filter)
    return rows.sort((a, b) => (a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : 0))
  }
  let query = supabase!.from('receipts').select('*').order('datum', { ascending: false })
  if (filter?.jahr) {
    query = query.gte('datum', `${filter.jahr}-01-01`).lte('datum', `${filter.jahr}-12-31`)
  }
  if (filter?.monat && filter?.jahr) {
    const von = `${filter.jahr}-${String(filter.monat).padStart(2, '0')}-01`
    const bisDatum = new Date(filter.jahr, filter.monat, 0) // letzter Tag des Monats
    const bis = `${filter.jahr}-${String(filter.monat).padStart(2, '0')}-${String(bisDatum.getDate()).padStart(2, '0')}`
    query = query.gte('datum', von).lte('datum', bis)
  }
  if (filter?.ort) query = query.ilike('ort', filter.ort)
  if (filter?.nurGeschaetzteKm) query = query.eq('km_quelle', 'ort').eq('km_manuell', false)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return applyFilter((data ?? []) as Receipt[], filter?.suche ? { suche: filter.suche } : undefined)
}

export async function getReceipt(id: string): Promise<Receipt | null> {
  if (isDemoMode) {
    return lsReadReceipts().find((r) => r.id === id) ?? null
  }
  const { data, error } = await supabase!.from('receipts').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  return (data as Receipt) ?? null
}

export type ReceiptInput = Omit<Receipt, 'id' | 'user_id' | 'created_at' | 'updated_at'>

export async function createReceipt(input: ReceiptInput): Promise<Receipt> {
  if (isDemoMode) {
    const row: Receipt = {
      ...input,
      id: uuid(),
      user_id: DEMO_USER_ID,
      created_at: now(),
      updated_at: now(),
    }
    const rows = lsReadReceipts()
    rows.push(row)
    lsWriteReceipts(rows)
    return row
  }
  const user_id = await currentUserId()
  const { data, error } = await supabase!
    .from('receipts')
    .insert({ ...input, user_id })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as Receipt
}

export async function updateReceipt(id: string, patch: Partial<ReceiptInput>): Promise<Receipt> {
  if (isDemoMode) {
    const rows = lsReadReceipts()
    const idx = rows.findIndex((r) => r.id === id)
    if (idx === -1) throw new Error('Eintrag nicht gefunden.')
    rows[idx] = { ...rows[idx], ...patch, updated_at: now() }
    lsWriteReceipts(rows)
    return rows[idx]
  }
  const { data, error } = await supabase!
    .from('receipts')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as Receipt
}

export async function deleteReceipt(id: string): Promise<void> {
  if (isDemoMode) {
    lsWriteReceipts(lsReadReceipts().filter((r) => r.id !== id))
    return
  }
  const { error } = await supabase!.from('receipts').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ---------- Settings ----------

export async function getSettings(): Promise<Settings | null> {
  if (isDemoMode) return lsReadSettings()
  const user_id = await currentUserId()
  const { data, error } = await supabase!
    .from('settings')
    .select('*')
    .eq('user_id', user_id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as Settings) ?? null
}

export type SettingsInput = Partial<Omit<Settings, 'user_id' | 'updated_at'>>

export async function saveSettings(input: SettingsInput): Promise<Settings> {
  if (isDemoMode) {
    const prev = lsReadSettings()
    const next: Settings = {
      user_id: DEMO_USER_ID,
      display_name: input.display_name ?? prev?.display_name ?? 'Paula',
      home_strasse: input.home_strasse ?? prev?.home_strasse ?? null,
      home_plz: input.home_plz ?? prev?.home_plz ?? null,
      home_ort: input.home_ort ?? prev?.home_ort ?? null,
      // explizites null löscht Koordinaten (z. B. Geocoding fehlgeschlagen), undefined lässt sie unverändert
      home_lat: input.home_lat !== undefined ? input.home_lat : (prev?.home_lat ?? null),
      home_lng: input.home_lng !== undefined ? input.home_lng : (prev?.home_lng ?? null),
      km_pauschale: input.km_pauschale ?? prev?.km_pauschale ?? 0.3,
      onboarded: input.onboarded ?? prev?.onboarded ?? false,
      updated_at: now(),
    }
    localStorage.setItem(LS_SETTINGS, JSON.stringify(next))
    return next
  }
  const user_id = await currentUserId()
  const { data, error } = await supabase!
    .from('settings')
    .upsert({ user_id, ...input }, { onConflict: 'user_id' })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as Settings
}

// ---------- Belegfotos (Storage Bucket `belege` / Demo) ----------

/**
 * Lädt ein Belegfoto hoch und gibt den Speicher-Pfad zurück.
 * Supabase: `<user_id>/<uuid>.jpg` im privaten Bucket `belege` (RLS-konform).
 * Demo: `demo:<uuid>`, Bild liegt als Data-URL im localStorage.
 */
export async function uploadBelegFoto(file: Blob): Promise<string> {
  if (isDemoMode) {
    const key = `demo:${uuid()}`
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('Foto konnte nicht gelesen werden.'))
      reader.readAsDataURL(file)
    })
    const fotos = lsReadFotos()
    fotos[key] = dataUrl
    localStorage.setItem(LS_FOTOS, JSON.stringify(fotos))
    return key
  }
  const user_id = await currentUserId()
  const path = `${user_id}/${uuid()}.jpg`
  const { error } = await supabase!.storage.from('belege').upload(path, file, {
    contentType: file.type || 'image/jpeg',
    upsert: false,
  })
  if (error) throw new Error(error.message)
  return path
}

/** Gibt eine anzeigbare URL für einen gespeicherten Foto-Pfad zurück. */
export async function getFotoUrl(path: string): Promise<string | null> {
  if (isDemoMode) {
    return lsReadFotos()[path] ?? null
  }
  const { data, error } = await supabase!.storage.from('belege').createSignedUrl(path, 60 * 60)
  if (error) return null
  return data.signedUrl
}

/** Löscht ein Belegfoto (Storage-Objekt bzw. Demo-Eintrag). Best effort. */
export async function deleteBelegFoto(path: string): Promise<void> {
  if (isDemoMode) {
    const fotos = lsReadFotos()
    if (path in fotos) {
      delete fotos[path]
      localStorage.setItem(LS_FOTOS, JSON.stringify(fotos))
    }
    return
  }
  try {
    await supabase!.storage.from('belege').remove([path])
  } catch {
    // Foto-Löschen ist best effort — der Eintrag ist zu diesem Zeitpunkt schon weg
  }
}
