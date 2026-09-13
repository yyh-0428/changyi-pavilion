// Lossless at the exact size consumed by createSurface(); safe to run again.
import { stat, writeFile, rename } from 'node:fs/promises';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { SURFACE_ASSETS } from '../src/material-assets.js';

for (const filename of Object.values(SURFACE_ASSETS)) {
  const path = new URL(`../public/textures/${filename}`, import.meta.url);
  const before = await stat(path), image = await loadImage(path);
  if (image.width === 512 && image.height === 512) continue;
  const canvas = createCanvas(512, 512), ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0, 512, 512);
  const expected = ctx.getImageData(0, 0, 512, 512).data;
  const after = canvas.toBuffer('image/png'), temporary = new URL(path.href + '.tmp.png');
  await writeFile(temporary, after);
  const decoded = await loadImage(temporary);
  ctx.clearRect(0, 0, 512, 512); ctx.drawImage(decoded, 0, 0);
  if (!Buffer.from(expected).equals(Buffer.from(ctx.getImageData(0, 0, 512, 512).data))) throw new Error(`Pixel mismatch: ${filename}`);
  await rename(temporary, path);
  console.log(`${filename}: ${before.size} → ${after.length} bytes; runtime pixels unchanged`);
}
