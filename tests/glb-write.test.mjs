import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { writeVerifiedGlb } from '../scripts/write-glb.mjs';

test('atomic GLB export verifies the replacement and preserves the old file on truncated input',async t => {
  const root = await mkdtemp(resolve('.glb-write-test-')); t.after(() => rm(root,{ recursive: true,force: true }));
  const json = Buffer.from('{"asset":{"version":"2.0"}} ');
  const bytes = Buffer.alloc(20 + json.length); bytes.writeUInt32LE(0x46546c67,0); bytes.writeUInt32LE(2,4); bytes.writeUInt32LE(bytes.length,8);
  bytes.writeUInt32LE(json.length,12); bytes.writeUInt32LE(0x4e4f534a,16); json.copy(bytes,20);
  const output = join(root,'亭阁 model.glb'); await writeFile(output,'previous export');
  await assert.rejects(writeVerifiedGlb(output,bytes.subarray(0,25)),/不完整/);
  assert.equal(await readFile(output,'utf8'),'previous export');
  const result = await writeVerifiedGlb(output,bytes);
  assert.deepEqual(await readFile(output),bytes);
  assert.equal(result.sha256,createHash('sha256').update(bytes).digest('hex'));
  assert.deepEqual(await readdir(root),['亭阁 model.glb']);
});
