// QuittyPro — PDF- & CSV-Export für den Steuerberater (Einstellungen §3).
// Komplett clientseitig: PDF via pdfmake (mit eingebetteten App-Schriften,
// lazy geladen via dynamic import von vfs-fonts), CSV als Blob-Download.
// Auf iOS wird — wenn möglich — das System-Share-Sheet geöffnet,
// sonst klassischer Download.

import pdfMake from 'pdfmake/build/pdfmake.js'
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces'
import type { Receipt, Settings } from './types'
import type { Zeitraum } from './zeitraum'
import { zeitraumLabel, zeitraumSuffix } from './zeitraum'
import { parseDatum } from './format'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'

export type { Zeitraum } from './zeitraum'

// Design-Tokens (tailwind.config.js / design.md §2.1)
const FARBE = {
  ink: '#22281F',
  inkSoft: '#6B7263',
  brand: '#1E5B43',
  brandSoft: '#E3EDE5',
  ochre: '#B08C3D',
  line: '#DDD6C4',
} as const

// ---------- Zahlformatierung für PDF/CSV (de-DE, tabellarisch) ----------

function deZahl(wert: number, nachkommastellen = 2): string {
  return new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: nachkommastellen,
    maximumFractionDigits: nachkommastellen,
  }).format(wert)
}

function deKm(km: number): string {
  return deZahl(km, 1)
}

function nameDes(receipt: Receipt): string {
  return [receipt.vorname, receipt.nachname].filter(Boolean).join(' ')
}

function datumLang(datum: string): string {
  return format(parseDatum(datum), 'dd.MM.yyyy', { locale: de })
}

/** km-Wert einer Fahrt: km gesamt (Hin+Rück) × Pauschale */
function kmWert(receipt: Receipt, pauschale: number): number | null {
  if (receipt.km_einfach == null) return null
  return receipt.km_einfach * 2 * pauschale
}

// ---------- pdfmake-Setup (lazy) ----------

let pdfBereit: Promise<void> | null = null

function ladePdf(): Promise<void> {
  if (!pdfBereit) {
    pdfBereit = import('./vfs-fonts').then((mod) => {
      pdfMake.addVirtualFileSystem(mod.default)
      pdfMake.addFonts({
        Atkinson: {
          normal: 'Atkinson-Hyperlegible.ttf',
          bold: 'Atkinson-Hyperlegible-Bold.ttf',
          italics: 'Atkinson-Hyperlegible.ttf',
          bolditalics: 'Atkinson-Hyperlegible-Bold.ttf',
        },
        Fraunces: {
          normal: 'Fraunces-SemiBold.ttf',
          bold: 'Fraunces-SemiBold.ttf',
          italics: 'Fraunces-SemiBold.ttf',
          bolditalics: 'Fraunces-SemiBold.ttf',
        },
        Caveat: {
          normal: 'Caveat-SemiBold.ttf',
          bold: 'Caveat-SemiBold.ttf',
          italics: 'Caveat-SemiBold.ttf',
          bolditalics: 'Caveat-SemiBold.ttf',
        },
      })
    })
  }
  return pdfBereit
}

async function ladeLogoSvg(): Promise<string | null> {
  try {
    const res = await fetch('/logo-mark.svg')
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

// ---------- Teilen / Herunterladen ----------

function ladeHerunter(blob: Blob, dateiname: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = dateiname
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** iOS: System-Share-Sheet (wenn unterstützt), sonst Download. */
async function teilenOderHerunterladen(blob: Blob, dateiname: string): Promise<void> {
  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean
    share?: (data: { files: File[]; title?: string }) => Promise<void>
  }
  try {
    const file = new File([blob], dateiname, { type: blob.type })
    if (nav.canShare?.({ files: [file] }) && nav.share) {
      await nav.share({ files: [file], title: dateiname })
      return
    }
  } catch (err) {
    // Abbruch durch Nutzerin → kein Fallback-Download
    if ((err as Error)?.name === 'AbortError') return
  }
  ladeHerunter(blob, dateiname)
}

// ---------- PDF ----------

function quittungsTabelle(receipts: Receipt[]): Content {
  const summe = receipts.reduce((s, r) => s + r.betrag, 0)
  const kopf = (text: string, alignment?: 'left' | 'right') => ({
    text,
    bold: true,
    color: FARBE.brand,
    alignment,
  })
  return {
    table: {
      headerRows: 1,
      widths: ['auto', '*', 'auto', 'auto', 'auto'],
      body: [
        [kopf('Datum'), kopf('Name'), kopf('Tätigkeit'), kopf('Ort'), kopf('Betrag', 'right')],
        ...receipts.map((r) => [
          datumLang(r.datum),
          nameDes(r),
          r.taetigkeit ?? '—',
          r.ort,
          { text: deZahl(r.betrag) + ' €', alignment: 'right' as const },
        ]),
        [
          { text: 'Summe', bold: true, color: FARBE.ochre, colSpan: 4 },
          {},
          {},
          {},
          { text: deZahl(summe) + ' €', bold: true, color: FARBE.ochre, alignment: 'right' as const },
        ],
      ],
    },
    layout: tabellenLayout,
  }
}

function fahrtenTabelle(receipts: Receipt[], pauschale: number): Content {
  const mitKm = receipts.filter((r) => r.km_einfach != null)
  const summeKm = mitKm.reduce((s, r) => s + (r.km_einfach ?? 0) * 2, 0)
  const summeWert = mitKm.reduce((s, r) => s + (kmWert(r, pauschale) ?? 0), 0)
  const kopf = (text: string, alignment?: 'left' | 'right') => ({
    text,
    bold: true,
    color: FARBE.brand,
    alignment,
  })
  return {
    table: {
      headerRows: 1,
      widths: ['auto', '*', 'auto', 'auto', 'auto'],
      body: [
        [
          kopf('Datum'),
          kopf('Ziel'),
          kopf('km einfach', 'right'),
          kopf('km gesamt', 'right'),
          kopf(`km-Wert (${deZahl(pauschale)} €/km)`, 'right'),
        ],
        ...receipts.map((r) => [
          datumLang(r.datum),
          {
            text: [
              r.ort,
              {
                text: `  (${r.km_quelle === 'adresse' ? 'exakt' : 'geschätzt'})`,
                fontSize: 8,
                color: FARBE.inkSoft,
              },
            ],
          },
          { text: r.km_einfach != null ? deKm(r.km_einfach) : '—', alignment: 'right' as const },
          {
            text: r.km_einfach != null ? deKm(r.km_einfach * 2) : '—',
            alignment: 'right' as const,
          },
          {
            text: kmWert(r, pauschale) != null ? deZahl(kmWert(r, pauschale)!) + ' €' : '—',
            alignment: 'right' as const,
          },
        ]),
        [
          { text: 'Summe', bold: true, color: FARBE.ochre, colSpan: 3 },
          {},
          {},
          { text: deKm(summeKm), bold: true, color: FARBE.ochre, alignment: 'right' as const },
          {
            text: deZahl(summeWert) + ' €',
            bold: true,
            color: FARBE.ochre,
            alignment: 'right' as const,
          },
        ],
      ],
    },
    layout: tabellenLayout,
  }
}

const tabellenLayout = {
  fillColor: (rowIndex: number) => (rowIndex === 0 ? FARBE.brandSoft : null),
  hLineWidth: () => 0.5,
  vLineWidth: () => 0,
  hLineColor: () => FARBE.line,
  paddingTop: () => 5,
  paddingBottom: () => 5,
  paddingLeft: () => 4,
  paddingRight: () => 4,
}

/**
 * Erzeugt die Abrechnungs-PDF und gibt sie an das System weiter
 * (iOS Share-Sheet bzw. Download).
 */
export async function erstellePdf(
  receipts: Receipt[],
  settings: Settings | null,
  zeitraum: Zeitraum,
): Promise<void> {
  await ladePdf()
  const logoSvg = await ladeLogoSvg()
  const pauschale = settings?.km_pauschale ?? 0.3
  const heute = format(new Date(), 'dd.MM.yyyy', { locale: de })

  const adresseZeilen: string[] = []
  if (settings?.home_strasse) adresseZeilen.push(settings.home_strasse)
  if (settings?.home_plz || settings?.home_ort) {
    adresseZeilen.push([settings.home_plz, settings.home_ort].filter(Boolean).join(' '))
  }

  const kopf: Content = {
    columns: [
      logoSvg
        ? ({ svg: logoSvg, width: 44 } as Content)
        : { text: '', width: 44 },
      {
        stack: [
          { text: 'QuittyPro — Paulas Quittungsbuch', font: 'Fraunces', fontSize: 17, color: FARBE.ink },
          { text: 'für Paula', font: 'Caveat', fontSize: 14, color: FARBE.brand },
          { text: `Abrechnung ${zeitraumLabel(zeitraum)}`, fontSize: 11, color: FARBE.inkSoft, margin: [0, 8, 0, 0] },
        ],
        margin: [12, 0, 0, 0],
      },
      adresseZeilen.length
        ? {
            stack: adresseZeilen.map((zeile) => ({ text: zeile, fontSize: 11, color: FARBE.inkSoft })),
            alignment: 'right' as const,
          }
        : { text: '', width: 'auto' as const },
    ],
    columnGap: 8,
    margin: [0, 0, 0, 18],
  }

  const doc: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [48, 48, 48, 64],
    defaultStyle: { font: 'Atkinson', fontSize: 10.5, color: FARBE.ink },
    footer: (seite) => ({
      text: `Erstellt am ${heute} mit QuittyPro · Angaben ohne Gewähr, bitte mit Originalbelegen abgleichen. · Seite ${seite}`,
      alignment: 'center',
      fontSize: 9,
      color: FARBE.inkSoft,
      margin: [48, 24, 48, 0],
    }),
    content: [
      kopf,
      { text: 'Quittungen', font: 'Fraunces', fontSize: 13, color: FARBE.ink, margin: [0, 0, 0, 6] },
      quittungsTabelle(receipts),
      { text: 'Fahrten', font: 'Fraunces', fontSize: 13, color: FARBE.ink, margin: [0, 22, 0, 6] },
      fahrtenTabelle(receipts, pauschale),
    ],
  }

  const blob: Blob = await pdfMake.createPdf(doc).getBlob()
  await teilenOderHerunterladen(blob, `QuittyPro_Abrechnung_${zeitraumSuffix(zeitraum)}.pdf`)
}

// ---------- CSV ----------

function csvZelle(wert: string): string {
  // Semikolon-getrennt; Zellen mit Trenner/Anführungszeichen/Umbruch quoten
  return /[;"\n]/.test(wert) ? `"${wert.replace(/"/g, '""')}"` : wert
}

/** Erzeugt die Abrechnungs-CSV (Semikolon, Dezimalkomma, UTF-8-BOM für Excel). */
export async function erstelleCsv(
  receipts: Receipt[],
  settings: Settings | null,
  zeitraum: Zeitraum,
): Promise<void> {
  const pauschale = settings?.km_pauschale ?? 0.3
  const zeilen: string[] = []

  zeilen.push(`QuittyPro — Abrechnung ${zeitraumLabel(zeitraum)}`)
  zeilen.push('')
  zeilen.push('Quittungen')
  zeilen.push('Datum;Name;Tätigkeit;Ort;Betrag')
  for (const r of receipts) {
    zeilen.push(
      [datumLang(r.datum), csvZelle(nameDes(r)), csvZelle(r.taetigkeit ?? ''), csvZelle(r.ort), deZahl(r.betrag)].join(';'),
    )
  }
  zeilen.push(`Summe;;;;${deZahl(receipts.reduce((s, r) => s + r.betrag, 0))}`)
  zeilen.push('')
  zeilen.push('Fahrten')
  zeilen.push(`Datum;Ziel;km einfach;km gesamt;km-Wert (${deZahl(pauschale)} €/km)`)
  for (const r of receipts) {
    const wert = kmWert(r, pauschale)
    zeilen.push(
      [
        datumLang(r.datum),
        csvZelle(`${r.ort} (${r.km_quelle === 'adresse' ? 'exakt' : 'geschätzt'})`),
        r.km_einfach != null ? deKm(r.km_einfach) : '',
        r.km_einfach != null ? deKm(r.km_einfach * 2) : '',
        wert != null ? deZahl(wert) : '',
      ].join(';'),
    )
  }
  const mitKm = receipts.filter((r) => r.km_einfach != null)
  zeilen.push(
    `Summe;;;${deKm(mitKm.reduce((s, r) => s + (r.km_einfach ?? 0) * 2, 0))};${deZahl(
      mitKm.reduce((s, r) => s + (kmWert(r, pauschale) ?? 0), 0),
    )}`,
  )

  // \uFEFF (BOM), damit Excel die Datei als UTF-8 erkennt (Umlaute!)
  const blob = new Blob(['\uFEFF' + zeilen.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  await teilenOderHerunterladen(blob, `QuittyPro_Abrechnung_${zeitraumSuffix(zeitraum)}.csv`)
}
