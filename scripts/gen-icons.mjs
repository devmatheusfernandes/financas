/**
 * Gera os ícones PWA em public/. Rode de novo se mudar as cores da marca:
 *   node scripts/gen-icons.mjs
 *
 * Desenha um quadrado arredondado escuro com três barras crescentes (azul = entradas,
 * laranja = saídas). Sem dependências: rasteriza num buffer e grava o PNG na mão.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

const INK = [0x16, 0x19, 0x1b];
const BARS = [
  [0x24, 0x59, 0xc7], // azul (entradas)
  [0xc2, 0x57, 0x1a], // laranja (saídas)
  [0x7f, 0xa6, 0xf5], // azul claro
];

/* ---------------- PNG ---------------- */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** rgba: Uint8Array com size*size*4 */
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 8 bits por canal
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filtro "none"
    rgba.subarray(y * size * 4, (y + 1) * size * 4).forEach((v, i) => {
      raw[y * (size * 4 + 1) + 1 + i] = v;
    });
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---------------- desenho ---------------- */

const SS = 4; // supersampling, para as bordas saírem suaves

/** Desenha em escala SS e reduz, devolvendo RGBA de size×size. */
function draw(size, { radius, pad }) {
  const n = size * SS;
  const acc = new Float64Array(n * n * 4);

  const put = (x, y, [r, g, b]) => {
    const i = (y * n + x) * 4;
    acc[i] = r;
    acc[i + 1] = g;
    acc[i + 2] = b;
    acc[i + 3] = 255;
  };

  // fundo: quadrado de cantos arredondados (radius em fração do lado; 0.5 = círculo)
  const rad = radius * n;
  const inCorner = (x, y) => {
    const cx = Math.min(Math.max(x, rad), n - rad);
    const cy = Math.min(Math.max(y, rad), n - rad);
    return (x - cx) ** 2 + (y - cy) ** 2 <= rad * rad;
  };
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (inCorner(x + 0.5, y + 0.5)) put(x, y, INK);
    }
  }

  // três barras crescentes, dentro da área segura (pad = fração livre em cada lado)
  const area = n * (1 - 2 * pad);
  const left = n * pad;
  const bottom = n * (1 - pad);
  const gap = area * 0.12;
  const barW = (area - gap * 2) / 3;
  const heights = [0.45, 0.72, 1];
  const barRad = barW * 0.22;

  heights.forEach((h, i) => {
    const x0 = left + i * (barW + gap);
    const y0 = bottom - area * h;
    const w = barW;
    const hh = area * h;
    for (let y = Math.floor(y0); y < Math.ceil(bottom); y++) {
      for (let x = Math.floor(x0); x < Math.ceil(x0 + w); x++) {
        // cantos arredondados só no topo da barra
        const cx = Math.min(Math.max(x + 0.5, x0 + barRad), x0 + w - barRad);
        const cy = Math.max(y + 0.5, y0 + barRad);
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= barRad * barRad || y + 0.5 > y0 + barRad) {
          if (x >= 0 && x < n && y >= 0 && y < n && y + 0.5 >= y0 && x + 0.5 >= x0 && x + 0.5 <= x0 + w) {
            put(x, y, BARS[i]);
          }
        }
      }
    }
    void hh;
  });

  // reduz SS×SS para 1 pixel
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let dy = 0; dy < SS; dy++) {
        for (let dx = 0; dx < SS; dx++) {
          const i = ((y * SS + dy) * n + x * SS + dx) * 4;
          r += acc[i];
          g += acc[i + 1];
          b += acc[i + 2];
          a += acc[i + 3];
        }
      }
      const k = SS * SS;
      const o = (y * size + x) * 4;
      out[o] = Math.round(r / k);
      out[o + 1] = Math.round(g / k);
      out[o + 2] = Math.round(b / k);
      out[o + 3] = Math.round(a / k);
    }
  }
  return out;
}

const FILES = [
  // [arquivo, tamanho, raio dos cantos, margem interna]
  ["icon-192.png", 192, 0.22, 0.24],
  ["icon-512.png", 512, 0.22, 0.24],
  // maskable: fundo inteiro e conteúdo dentro do círculo seguro (80% central)
  ["icon-maskable-512.png", 512, 0.5, 0.32],
  ["apple-icon.png", 180, 0.0, 0.24],
];

for (const [name, size, radius, pad] of FILES) {
  writeFileSync(join(OUT, name), png(size, draw(size, { radius, pad })));
  console.log("✓", name, `${size}×${size}`);
}
