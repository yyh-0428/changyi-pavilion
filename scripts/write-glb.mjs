import { open, rename, unlink } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export function validateGlbEnvelope(bytes) {
  const view = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if (bytes.byteLength < 28 || view.getUint32(0,true) !== 0x46546c67 || view.getUint32(4,true) !== 2 || view.getUint32(8,true) !== bytes.byteLength) throw new Error('GLB 头或文件长度不完整，保留原文件。');
  let offset = 12;
  while (offset < bytes.byteLength) {
    if (offset + 8 > bytes.byteLength) throw new Error('GLB 数据块头被截断。');
    const length = view.getUint32(offset,true);
    if (length % 4 || offset + 8 + length > bytes.byteLength) throw new Error('GLB 数据块长度错误。');
    if (offset === 12 && view.getUint32(offset + 4,true) !== 0x4e4f534a) throw new Error('GLB 缺少 JSON 数据块。');
    offset += 8 + length;
  }
}

// Write, flush and re-read the checksum before replacing the last complete export.
export async function writeVerifiedGlb(path, bytes) {
  validateGlbEnvelope(bytes);
  const target = path instanceof URL ? fileURLToPath(path) : path;
  const temporary = `${target}.${randomUUID()}.tmp`;
  const expected = createHash('sha256').update(bytes).digest('hex');
  try {
    const handle = await open(temporary,'wx');
    try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
    const hash = createHash('sha256'); let size = 0;
    for await (const chunk of createReadStream(temporary)) { hash.update(chunk); size += chunk.length; }
    if (size !== bytes.byteLength || hash.digest('hex') !== expected) throw new Error('GLB 写入后的校验不一致，保留原文件。');
    await rename(temporary,target);
    return { bytes: size, sha256: expected };
  } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}
