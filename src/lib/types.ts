// QuittyPro — gemeinsame Typen (Felder exakt wie in /mnt/agents/output/supabase/schema.sql)

export type Anrede = 'herr' | 'frau' | 'divers'

export type KmQuelle = 'adresse' | 'ort' | 'manuell'

export type EintragQuelle = 'foto' | 'manuell'

/** Eine Quittung / ein Eintrag im Quittungsbuch (Tabelle `receipts`) */
export interface Receipt {
  id: string
  user_id: string
  datum: string // ISO-Datum 'YYYY-MM-DD'
  anrede: Anrede
  vorname: string | null
  nachname: string
  betrag: number
  taetigkeit: string | null
  ort: string
  plz: string | null
  strasse: string | null
  hausnr: string | null
  /** Einfache Strecke in km (Hin- oder Rückfahrt). Anzeige immer ×2. */
  km_einfach: number | null
  km_quelle: KmQuelle | null
  km_manuell: boolean
  betrag_in_worten: string | null
  foto_path: string | null
  /** Feldnamen mit unsicherer OCR-Erkennung, z. B. {"betrag": true} */
  ocr_unsicher: Record<string, boolean> | null
  quelle: EintragQuelle
  created_at: string
  updated_at: string
}

/** Einstellungen der Nutzerin (Tabelle `settings`, 1 Zeile pro Nutzerin) */
export interface Settings {
  user_id: string
  display_name: string
  home_strasse: string | null
  home_plz: string | null
  home_ort: string | null
  home_lat: number | null
  home_lng: number | null
  km_pauschale: number
  onboarded: boolean
  updated_at: string
}

/** Ergebnis der Beleg-Erkennung (Netlify Function `ocr`) */
export interface OcrResult {
  felder: {
    betrag_gesamt: number | null
    betrag_in_worten: string | null
    anrede: Anrede | null
    vorname: string | null
    nachname: string | null
    taetigkeit: string | null
    ort: string | null
    datum: string | null
  }
  /** true = Feld bitte prüfen (wird orange markiert) */
  unsicher: Record<string, boolean>
}

/** Filter für die Eintragsliste */
export interface ReceiptFilter {
  /** 1–12, optional */
  monat?: number
  jahr?: number
  ort?: string
  /** nur Einträge mit geschätzten km (Quelle 'ort') */
  nurGeschaetzteKm?: boolean
  /** Freitext: Name, Ort, Tätigkeit */
  suche?: string
}
