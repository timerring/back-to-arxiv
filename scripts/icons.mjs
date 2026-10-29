import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const payload = Buffer.concat([Buffer.from(type), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(payload));
  return Buffer.concat([length, payload, checksum]);
}

function segmentDistance(x, y, ax, ay, bx, by) {
  const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
  return Math.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay));
}

function pixel(x, y) {
  const corner = Math.hypot(Math.max(Math.abs(x - 64) - 36, 0), Math.max(Math.abs(y - 64) - 36, 0));
  if (corner > 24) return [0, 0, 0, 0];
  const strokes = [[55, 39, 30, 64], [30, 64, 55, 89], [30, 64, 94, 64], [90, 35, 98, 35], [98, 35, 98, 93], [90, 93, 98, 93]];
  if (strokes.some(([ax, ay, bx, by]) => segmentDistance(x, y, ax, ay, bx, by) < 4.5)) return [255, 250, 242, 255];
  return [147, 60, 53, 255];
}

function png(size) {
  const scanlines = Buffer.alloc((size * 4 + 1) * size);
  const samples = 4;
  // Store icons use a 96px mark with 16px of transparent padding on each side.
  const artworkScale = size === 128 ? 0.8 : 1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const totals = [0, 0, 0, 0];
      for (let sy = 0; sy < samples; sy++) for (let sx = 0; sx < samples; sx++) {
        const px = (x + (sx + .5) / samples) * 128 / size;
        const py = (y + (sy + .5) / samples) * 128 / size;
        const rgba = pixel((px - 64) / artworkScale + 64, (py - 64) / artworkScale + 64);
        for (let channel = 0; channel < 4; channel++) totals[channel] += rgba[channel];
      }
      const offset = y * (size * 4 + 1) + 1 + x * 4;
      for (let channel = 0; channel < 4; channel++) scanlines[offset + channel] = Math.round(totals[channel] / samples ** 2);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(scanlines)), chunk('IEND', Buffer.alloc(0))]);
}

export async function generateIcons(directory) {
  await mkdir(directory, { recursive: true });
  await Promise.all([16, 32, 48, 128].map((size) => writeFile(join(directory, `icon-${size}.png`), png(size))));
}
