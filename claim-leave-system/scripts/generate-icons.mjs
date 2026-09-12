import sharp from 'sharp'
import { mkdirSync } from 'fs'

// Larger, cleaner mark for app icon use (the favicon's "A" glyph, bigger canvas)
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#12212B"/>
  <path d="M148 338 L216 174 H 260 L 328 338 H 284 L 270 302 H 206 L 192 338 Z M 216 268 H 260 L 238 210 Z"
    fill="#1E8A72"/>
</svg>
`

mkdirSync('public/icons', { recursive: true })

const sizes = [
  { file: 'public/icons/icon-192.png', size: 192 },
  { file: 'public/icons/icon-512.png', size: 512 },
  { file: 'public/icons/maskable-512.png', size: 512, padded: true },
  { file: 'public/apple-touch-icon.png', size: 180 },
]

for (const s of sizes) {
  let img = sharp(Buffer.from(svg)).resize(s.size, s.size)
  if (s.padded) {
    // Maskable icons need safe-zone padding (~20%) so Android doesn't crop the mark
    const inner = Math.round(s.size * 0.7)
    img = sharp(Buffer.from(svg))
      .resize(inner, inner)
      .extend({
        top: Math.round((s.size - inner) / 2),
        bottom: Math.round((s.size - inner) / 2),
        left: Math.round((s.size - inner) / 2),
        right: Math.round((s.size - inner) / 2),
        background: '#12212B',
      })
  }
  await img.png().toFile(s.file)
  console.log('wrote', s.file)
}
