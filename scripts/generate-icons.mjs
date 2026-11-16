import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function createPlateIconPng(size) {
  // Warm terracotta background (#d9532f) + warm cream plate circle (#fffaf5) + inner accent ring
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const center = (size - 1) / 2;
  const outerPlateR = size * 0.34;
  const innerRimR = size * 0.25;
  const innerRimThickness = Math.max(2, size * 0.025);

  let offset = 0;
  for (let y = 0; y < size; y++) {
    raw[offset++] = 0; // filter byte
    for (let x = 0; x < size; x++) {
      const dx = x - center;
      const dy = y - center;
      const dist = Math.sqrt(dx * dx + dy * dy);

      let r = 217;
      let g = 83;
      let b = 47;

      if (dist <= outerPlateR) {
        if (Math.abs(dist - innerRimR) <= innerRimThickness) {
          r = 217;
          g = 83;
          b = 47;
        } else {
          r = 255;
          g = 250;
          b = 245;
        }
      }

      raw[offset++] = r;
      raw[offset++] = g;
      raw[offset++] = b;
      raw[offset++] = 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const compressed = zlib.deflateSync(raw);

  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

const outDir = path.join(process.cwd(), "public", "icons");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "icon-192.png"), createPlateIconPng(192));
fs.writeFileSync(path.join(outDir, "icon-512.png"), createPlateIconPng(512));
fs.writeFileSync(path.join(outDir, "apple-touch-icon.png"), createPlateIconPng(180));
console.log("✔ Generated PWA PNG icons in public/icons/");
