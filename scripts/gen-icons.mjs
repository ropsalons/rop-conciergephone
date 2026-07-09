// Generates ROP Connect PWA icons as valid PNGs using only Node built-ins (zlib).
// Draws a rounded navy tile with a gold "R" monogram. Run: node scripts/gen-icons.mjs
import zlib from 'node:zlib'
import fs from 'node:fs'
import path from 'node:path'

const OUT = path.resolve('public/icons')
fs.mkdirSync(OUT, { recursive: true })

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }
  const idat = zlib.deflateSync(raw, { level: 9 })
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// Very small 5x7 bitmap font for the letter "R".
const R = [
  '11110',
  '10010',
  '10010',
  '11110',
  '10100',
  '10010',
  '10010',
]

function draw(size, maskable) {
  const rgba = Buffer.alloc(size * size * 4)
  const navy = [31, 42, 68] // brand-800
  const navy2 = [22, 29, 51]
  const gold = [224, 169, 47]
  const radius = maskable ? 0 : Math.round(size * 0.22)
  const px = (x, y, [r, g, b], a = 255) => {
    const i = (y * size + x) * 4
    rgba[i] = r
    rgba[i + 1] = g
    rgba[i + 2] = b
    rgba[i + 3] = a
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // rounded-rect mask (unless maskable — full bleed for safe zone)
      let inside = true
      if (!maskable) {
        const cx = Math.min(x, size - 1 - x)
        const cy = Math.min(y, size - 1 - y)
        if (cx < radius && cy < radius) {
          const dx = radius - cx
          const dy = radius - cy
          inside = dx * dx + dy * dy <= radius * radius
        }
      }
      if (!inside) {
        px(x, y, [0, 0, 0], 0)
        continue
      }
      // vertical gradient navy
      const t = y / size
      const col = [
        Math.round(navy[0] * (1 - t) + navy2[0] * t),
        Math.round(navy[1] * (1 - t) + navy2[1] * t),
        Math.round(navy[2] * (1 - t) + navy2[2] * t),
      ]
      px(x, y, col)
    }
  }
  // Draw gold "R" centered, scaled.
  const cell = Math.floor(size / 12)
  const glyphW = 5 * cell
  const glyphH = 7 * cell
  const ox = Math.floor((size - glyphW) / 2)
  const oy = Math.floor((size - glyphH) / 2)
  for (let gy = 0; gy < 7; gy++) {
    for (let gx = 0; gx < 5; gx++) {
      if (R[gy][gx] === '1') {
        for (let yy = 0; yy < cell; yy++) {
          for (let xx = 0; xx < cell; xx++) {
            px(ox + gx * cell + xx, oy + gy * cell + yy, gold)
          }
        }
      }
    }
  }
  return encodePNG(size, size, rgba)
}

fs.writeFileSync(path.join(OUT, 'icon-192.png'), draw(192, false))
fs.writeFileSync(path.join(OUT, 'icon-512.png'), draw(512, false))
fs.writeFileSync(path.join(OUT, 'icon-512-maskable.png'), draw(512, true))
fs.writeFileSync(path.join(OUT, 'apple-touch-icon.png'), draw(180, false))
console.log('Icons written to public/icons/')
