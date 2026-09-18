// Renders the source app icon (a split hex) to icon-source.png without any image deps.
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const N = 1024;
const px = Buffer.alloc(N * N * 4);
const hex = Array.from({ length: 6 }, (_, i) => {
  const a = ((60 * i - 30) * Math.PI) / 180;
  return [N / 2 + 420 * Math.cos(a), N / 2 + 420 * Math.sin(a)];
});
const inside = (x, y) => {
  let c = false;
  for (let i = 0, j = 5; i < 6; j = i++) {
    const [xi, yi] = hex[i], [xj, yj] = hex[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
for (let y = 0; y < N; y++) {
  for (let x = 0; x < N; x++) {
    const o = (y * N + x) * 4;
    if (!inside(x + 0.5, y + 0.5)) continue;
    const gap = Math.abs(x - N / 2) < 14;
    const [r, g, b] = gap ? [245, 243, 238] : x < N / 2 ? [74, 100, 200] : [192, 80, 58];
    px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = 255;
  }
}
const raw = Buffer.alloc((N * 4 + 1) * N);
for (let y = 0; y < N; y++) px.copy(raw, y * (N * 4 + 1) + 1, y * N * 4, (y + 1) * N * 4);
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 6;
writeFileSync(
  "icon-source.png",
  Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]),
);
