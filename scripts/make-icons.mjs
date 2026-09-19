/* ============================================================================
   توليد أيقونات ويندوز من علامة تبارك جيم نفسها (scripts/brand-mark.svg).
   لا اعتماد خارجي: الرسم يتم في متصفح حقيقي، والبكسلات تُقرأ خاماً، ثم
   تُبنى ملفات PNG و ICO هنا بايتاً بايتاً.
   التشغيل:  npm run icons
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const OUT  = path.join(ROOT, 'src-tauri', 'icons');
const SVG  = fs.readFileSync(path.join(HERE, 'brand-mark.svg'), 'utf8');

/* ------------------------------- PNG ------------------------------------ */
const crcTable = (() => { const t = new Int32Array(256);
  for (let i = 0; i < 256; i++){ let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[i] = c; }
  return t; })();
const crc32 = buf => { let c = -1; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => {
  const t = Buffer.from(type, 'latin1');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
};
function png(rgba, w, h){
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++){
    raw[y * (w * 4 + 1)] = 0;                                  /* filter: none */
    rgba.copy ? rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
              : Buffer.from(rgba).copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;   /* 8-bit RGBA */
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------- ICO ------------------------------------
   المقاسات الصغيرة تُكتب DIB غير مضغوطة (أوسع توافقاً في صدفة ويندوز)،
   و256 تُكتب PNG لأن DIB بهذا الحجم يضخّم الملف بلا داعٍ. */
function dib(rgba, w, h){
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0); header.writeInt32LE(w, 4); header.writeInt32LE(h * 2, 8);
  header.writeUInt16LE(1, 12); header.writeUInt16LE(32, 14);
  const xorRow = w * 4, xor = Buffer.alloc(xorRow * h);
  for (let y = 0; y < h; y++){
    const src = (h - 1 - y) * w * 4, dst = y * xorRow;         /* DIB مقلوب رأسياً */
    for (let x = 0; x < w; x++){
      xor[dst + x*4 + 0] = rgba[src + x*4 + 2];                /* B */
      xor[dst + x*4 + 1] = rgba[src + x*4 + 1];                /* G */
      xor[dst + x*4 + 2] = rgba[src + x*4 + 0];                /* R */
      xor[dst + x*4 + 3] = rgba[src + x*4 + 3];                /* A */
    }
  }
  const andRow = Math.ceil(w / 32) * 4;                        /* قناع 1bpp مصفوف على 4 بايت */
  const and = Buffer.alloc(andRow * h, 0);
  header.writeUInt32LE(xor.length + and.length, 20);
  return Buffer.concat([header, xor, and]);
}
function ico(images){
  const entries = [], blobs = [];
  let offset = 6 + images.length * 16;
  for (const im of images){
    const data = im.size >= 256 ? png(im.rgba, im.size, im.size) : dib(im.rgba, im.size, im.size);
    const e = Buffer.alloc(16);
    e[0] = im.size >= 256 ? 0 : im.size; e[1] = im.size >= 256 ? 0 : im.size;
    e[2] = 0; e[3] = 0;
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8); e.writeUInt32LE(offset, 12);
    entries.push(e); blobs.push(data); offset += data.length;
  }
  const head = Buffer.alloc(6); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(images.length, 4);
  return Buffer.concat([head, ...entries, ...blobs]);
}

/* ------------------------------ الرسم ----------------------------------- */
const SIZES = [16, 24, 32, 48, 64, 128, 256];
const PNGS  = { '32x32.png': 32, '128x128.png': 128, '128x128@2x.png': 256, 'icon.png': 512,
                'Square44x44Logo.png': 44, 'Square71x71Logo.png': 71, 'Square89x89Logo.png': 89,
                'Square107x107Logo.png': 107, 'Square142x142Logo.png': 142, 'Square150x150Logo.png': 150,
                'Square284x284Logo.png': 284, 'Square310x310Logo.png': 310, 'StoreLogo.png': 50 };

const browser = await chromium.launch({ executablePath: process.env.TG_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage();
await page.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:0">${SVG}</body>`);

async function raster(size){
  const arr = await page.evaluate(async (n) => {
    const svg = document.querySelector('svg');
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type:'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const c = document.createElement('canvas'); c.width = c.height = n;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, n, n);
    ctx.drawImage(img, 0, 0, n, n);
    URL.revokeObjectURL(url);
    return Array.from(ctx.getImageData(0, 0, n, n).data);
  }, size);
  return Buffer.from(arr);
}

fs.mkdirSync(OUT, { recursive: true });
const cache = new Map();
const get = async n => { if (!cache.has(n)) cache.set(n, await raster(n)); return cache.get(n); };

const icoImages = [];
for (const n of SIZES) icoImages.push({ size: n, rgba: await get(n) });
fs.writeFileSync(path.join(OUT, 'icon.ico'), ico(icoImages));

for (const [name, n] of Object.entries(PNGS))
  fs.writeFileSync(path.join(OUT, name), png(await get(n), n, n));

await browser.close();
const list = fs.readdirSync(OUT).sort();
console.log('أيقونات مكتوبة في src-tauri/icons:');
for (const f of list) console.log(`  ${f.padEnd(24)} ${fs.statSync(path.join(OUT, f)).size} bytes`);
