// Android launcher icons (adaptive + legacy) and splash screens, rendered
// from build/icon.svg so every platform shares one source of truth.
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const res = join(root, 'android/app/src/main/res')
if (!existsSync(res)) {
  console.error('android/ not found — run `npx cap add android` first.')
  process.exit(1)
}

const svg = readFileSync(join(root, 'build/icon.svg'), 'utf8')
const defs = svg.match(/<defs>[\s\S]*?<\/defs>/)?.[0] ?? ''
// The artwork without the rounded-square tile it sits on.
const art = svg
  .replace(/<svg[^>]*>/, '')
  .replace('</svg>', '')
  .replace(defs, '')
  .replace(/<rect[^>]*\/>/g, '')

const BG = '#F3EDFD'

// Adaptive foreground: 108×108 canvas, art kept inside the 66dp safe circle.
const foreground = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">${defs}
  <g transform="translate(23.28 23.28) scale(0.12)">${art}</g></svg>`
// Legacy round icon: tile clipped to a circle.
const round = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${defs}
  <circle cx="256" cy="256" r="256" fill="${BG}"/>
  <g transform="translate(46 40) scale(0.82)">${art}</g></svg>`
// Splash: the full tile centered on the app background.
const splash = (w, h) => {
  const size = Math.round(Math.min(w, h) * 0.32)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="#FBF7FF"/>
  <svg x="${(w - size) / 2}" y="${(h - size) / 2}" width="${size}" height="${size}" viewBox="0 0 512 512">${svg.replace(/<svg[^>]*>/, '').replace('</svg>', '')}</svg>
</svg>`
}

const render = (source, w, h, file) =>
  sharp(Buffer.from(source), { density: 384 }).resize(w, h).png().toFile(join(res, file))

const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }
for (const [d, k] of Object.entries(densities)) {
  await render(svg, 48 * k, 48 * k, `mipmap-${d}/ic_launcher.png`)
  await render(round, 48 * k, 48 * k, `mipmap-${d}/ic_launcher_round.png`)
  await render(foreground, 108 * k, 108 * k, `mipmap-${d}/ic_launcher_foreground.png`)
}

const splashes = {
  drawable: [480, 320],
  'drawable-land-mdpi': [480, 320],
  'drawable-land-hdpi': [800, 480],
  'drawable-land-xhdpi': [1280, 720],
  'drawable-land-xxhdpi': [1600, 960],
  'drawable-land-xxxhdpi': [1920, 1280],
  'drawable-port-mdpi': [320, 480],
  'drawable-port-hdpi': [480, 800],
  'drawable-port-xhdpi': [720, 1280],
  'drawable-port-xxhdpi': [960, 1600],
  'drawable-port-xxxhdpi': [1280, 1920]
}
for (const [dir, [w, h]] of Object.entries(splashes)) await render(splash(w, h), w, h, `${dir}/splash.png`)

writeFileSync(
  join(res, 'values/ic_launcher_background.xml'),
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG}</color>\n</resources>\n`
)
console.log('Android icons and splash screens generated.')
