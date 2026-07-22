// QuittyPro — generiert die PWA/Apple-Icons zur Build-Zeit aus public/logo-mark.svg.
// So liegen keine Binärdateien im Git-Repo. Läuft als Teil von `npm run build`.

import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SVG = join(ROOT, 'public', 'logo-mark.svg')
const HINTERGRUND = '#F7F4EA' // paper — Design-Token (design.md §2.1)
const INNENRAND = 0.12 // 12 % wie im Design-Asset-Manifest

const ICONS = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
]

for (const [datei, groesse] of ICONS) {
  const innen = Math.round(groesse * (1 - 2 * INNENRAND))
  const logo = await sharp(SVG, { density: 384 })
    .resize(innen, innen, { fit: 'inside' })
    .png()
    .toBuffer()
  const ziel = join(ROOT, 'public', datei)
  await sharp({
    create: { width: groesse, height: groesse, channels: 3, background: HINTERGRUND },
  })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(ziel)
  console.log(`ok ${datei} (${groesse}x${groesse})`)
}
console.log('Icons generiert aus logo-mark.svg')
