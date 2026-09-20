/**
 * Generate the PWA icons. Committed output, run by hand (`npm run icons -w @80in8/web`),
 * so the build needs no image toolchain and the app ships no binary dependency.
 *
 * A PNG is a signature plus a handful of length-prefixed, CRC32-tagged chunks around a
 * zlib stream of filter-prefixed scanlines; that is little enough to write directly.
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BG = [0x0e, 0x11, 0x16]
const FG = [0x7e, 0xe7, 0x87]

const GLYPHS = {
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0)
  return Buffer.concat([head, data, crc])
}

function png(size, pixels) {
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** `inset` is the fraction of the canvas kept clear, for the maskable safe zone. */
function icon(size, { radius, inset }) {
  const pixels = Buffer.alloc(size * size * 4)
  const set = (x, y, rgb, a = 255) => {
    const i = (y * size + x) * 4
    pixels[i] = rgb[0]
    pixels[i + 1] = rgb[1]
    pixels[i + 2] = rgb[2]
    pixels[i + 3] = a
  }

  const r = radius * size
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = Math.max(r - x - 0.5, x + 0.5 - (size - r), 0)
      const dy = Math.max(r - y - 0.5, y + 0.5 - (size - r), 0)
      set(x, y, BG, Math.hypot(dx, dy) <= r ? 255 : 0)
    }
  }

  // "80" laid out on a 5x7 grid per glyph with a one-cell gap.
  const cols = 5 + 1 + 5
  const usable = size * (1 - 2 * inset)
  const cell = Math.max(1, Math.floor(Math.min(usable / cols, usable / 7)))
  const left = Math.round((size - cell * cols) / 2)
  const top = Math.round((size - cell * 7) / 2)
  const glyphs = [GLYPHS[8], GLYPHS[0]]
  glyphs.forEach((glyph, index) => {
    const offset = left + index * 6 * cell
    glyph.forEach((row, ry) => {
      ;[...row].forEach((on, rx) => {
        if (on !== '1') return
        for (let y = 0; y < cell; y++) {
          for (let x = 0; x < cell; x++) set(offset + rx * cell + x, top + ry * cell + y, FG)
        }
      })
    })
  })

  return png(size, pixels)
}

const out = (name) => fileURLToPath(new URL(`../public/${name}`, import.meta.url))

writeFileSync(out('icon-192.png'), icon(192, { radius: 0.22, inset: 0.16 }))
writeFileSync(out('icon-512.png'), icon(512, { radius: 0.22, inset: 0.16 }))
// Maskable icons are cropped to a circle of 80% width, so the glyph sits well inside
// and the background covers the whole square.
writeFileSync(out('icon-maskable-512.png'), icon(512, { radius: 0.5, inset: 0.28 }))
writeFileSync(out('apple-touch-icon.png'), icon(180, { radius: 0.001, inset: 0.18 }))
console.log('icons written')
