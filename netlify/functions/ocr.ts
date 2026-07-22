// QuittyPro — Netlify Function: Beleg-Erkennung (OCR) via Anthropic Messages API.
// Empfängt { image: <base64-JPEG> } und antwortet mit strukturierten Feldern
// + unsicher-Flags. Antwortet NUR mit JSON. Fehlerfall → 502 mit deutscher Meldung.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-5'
const TIMEOUT_MS = 25_000

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json; charset=utf-8',
}

const PROMPT = `Du analysierst das Foto einer PVP-Quittung (Quittungsblock A6 quer, handschriftlich ausgefüllt, Deutsch).

Extrahiere diese Felder:
- betrag_gesamt: der Gesamtbetrag als Zahl (z. B. 32.00 für „32,00 €")
- betrag_in_worten: der Betrag in Worten, wie geschrieben (z. B. „zweiunddreißig")
- anrede: aus der „von"-Zeile: „H." → "herr", „Fr." → "frau", sonst null
- vorname / nachname: Name aus der „von"-Zeile, soweit erkennbar (sonst null)
- taetigkeit: eingetragene Tätigkeit/Leistung (z. B. „Fußpflege"), sonst null
- ort: Ortsangabe auf der Quittung, sonst null
- datum: Datum als ISO-String "YYYY-MM-DD", sonst null

Prüfe zusätzlich: Lies betrag_in_worten als deutsches Zahlwort (z. B. fünfundzwanzig = 25, zweiunddreißig = 32) und vergleiche mit betrag_gesamt. Bei Konflikt markiere "betrag_gesamt" als unsicher. Markiere außerdem jedes Feld als unsicher, das schwer lesbar oder zweifelhaft ist.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt in genau dieser Form, ohne weitere Texte oder Markdown:
{"felder":{"betrag_gesamt":null,"betrag_in_worten":null,"anrede":null,"vorname":null,"nachname":null,"taetigkeit":null,"ort":null,"datum":null},"unsicher":{"betrag_gesamt":false,"anrede":false,"nachname":false,"taetigkeit":false,"ort":false,"datum":false}}`

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS })
}

const FEHLER = {
  felder: null,
  fehler: 'Erkennung nicht verfügbar — bitte trage die Quittung von Hand ein.',
}

export default async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })
  if (req.method !== 'POST') return json(405, FEHLER)

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return json(502, FEHLER)

  let image: string
  try {
    const body = (await req.json()) as { image?: string }
    if (!body.image || typeof body.image !== 'string') return json(400, FEHLER)
    image = body.image
  } catch {
    return json(400, FEHLER)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: 'image/jpeg', data: image },
              },
              { type: 'text', text: PROMPT },
            ],
          },
        ],
      }),
    })
    if (!res.ok) return json(502, FEHLER)

    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> }
    const text = data.content?.find((c) => c.type === 'text')?.text ?? ''
    // JSON aus der Antwort ziehen (tolerant gegenüber Begleittext)
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return json(502, FEHLER)
    const parsed = JSON.parse(match[0]) as { felder?: unknown; unsicher?: unknown }
    if (!parsed.felder || typeof parsed.felder !== 'object') return json(502, FEHLER)
    return json(200, { felder: parsed.felder, unsicher: parsed.unsicher ?? {} })
  } catch {
    return json(502, FEHLER)
  } finally {
    clearTimeout(timeout)
  }
}
