// QuittyPro — generiert src/lib/vfs-fonts.ts zur Build-Zeit.
// Lädt die 4 App-Schriften (OFL-lizenziert) von Google Fonts und bettet sie
// als pdfmake-VFS ein, damit sie nicht im Git-Repo liegen müssen.
// Läuft automatisch als Teil von `npm run build` (prebuild).

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ZIEL = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'vfs-fonts.ts')

const FONTS = [
  ['Atkinson-Hyperlegible.ttf', 'https://fonts.gstatic.com/s/atkinsonhyperlegible/v12/9Bt23C1KxNDXMspQ1lPyU89-1h6ONRlW45GE5Q.ttf'],
  ['Atkinson-Hyperlegible-Bold.ttf', 'https://fonts.gstatic.com/s/atkinsonhyperlegible/v12/9Bt73C1KxNDXMspQ1lPyU89-1h6ONRlW45G8WbcNcw.ttf'],
  ['Fraunces-SemiBold.ttf', 'https://fonts.gstatic.com/s/fraunces/v38/6NUh8FyLNQOQZAnv9bYEvDiIdE9Ea92uemAk_WBq8U_9v0c2Wa0K7iN7hzFUPJH58nib1603gg7S2nfgRYIcaRyjDg.ttf'],
  ['Caveat-SemiBold.ttf', 'https://fonts.gstatic.com/s/caveat/v23/WnznHAc5bAfYB2QRah7pcpNvOx-pjSx6SII.ttf'],
]

async function ladeTtf(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Font-Download fehlgeschlagen (${res.status}): ${url}`)
  return Buffer.from(await res.arrayBuffer()).toString('base64')
}

const eintraege = []
for (const [name, url] of FONTS) {
  const b64 = await ladeTtf(url)
  eintraege.push(`  '${name}':\n    '${b64}'`)
  console.log(`ok ${name} (${Math.round(b64.length / 1024)} KB base64)`)
}

const inhalt = `// QuittyPro — pdfmake-VFS mit den App-Schriften (automatisch generiert, nicht von Hand ändern).
// Quellen: Google Fonts TTF (Atkinson Hyperlegible 400/700, Caveat 600, Fraunces 600), OFL-lizenziert.
// Wird zur Build-Zeit von scripts/generate-vfs-fonts.mjs erzeugt und ist daher nicht im Repo.

const vfs: Record<string, string> = {
${eintraege.join(',\n')}
}

export default vfs
`

mkdirSync(dirname(ZIEL), { recursive: true })
writeFileSync(ZIEL, inhalt)
console.log(`vfs-fonts.ts geschrieben: ${ZIEL}`)
