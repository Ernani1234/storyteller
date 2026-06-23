import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const __dirname = dirname(fileURLToPath(import.meta.url))
const buildDir = resolve(__dirname, '..', 'build')
const svgPath = resolve(buildDir, 'icon.svg')
const svg = readFileSync(svgPath)

const sizes = [16, 24, 32, 48, 64, 128, 256]

const pngBuffers = await Promise.all(
  sizes.map((size) =>
    sharp(svg, { density: 384 }).resize(size, size).png().toBuffer()
  )
)

// Full-size png for Linux / docs / app window
await sharp(svg, { density: 384 })
  .resize(512, 512)
  .png()
  .toFile(resolve(buildDir, 'icon.png'))

const ico = await pngToIco(pngBuffers)
writeFileSync(resolve(buildDir, 'icon.ico'), ico)

console.log('Generated build/icon.ico and build/icon.png')
