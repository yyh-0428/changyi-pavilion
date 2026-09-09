import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { loadImage } from '@napi-rs/canvas';
import { validateBytes } from 'gltf-validator';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { modelMetrics } from '../src/model-optimization.js';

globalThis.self = { URL };
globalThis.createImageBitmap = async blob => loadImage(Buffer.from(await blob.arrayBuffer()));
globalThis.ProgressEvent = class extends Event {
  constructor(type, values) { super(type); Object.assign(this, values); }
};
const filename = process.argv.includes('--compatible') ? 'changyi-pavilion-compatible.glb' : 'changyi-pavilion.glb';
const file = await readFile(new URL(`../${filename}`, import.meta.url));
assert.equal(file.readUInt32LE(0), 0x46546c67);
assert.equal(file.readUInt32LE(4), 2);
assert.equal(file.readUInt32LE(8), file.byteLength);
const document = JSON.parse(file.subarray(20, 20 + file.readUInt32LE(12)).toString());
const validation = await validateBytes(new Uint8Array(file), { uri: filename, maxIssues: 0, writeTimestamp: false });
await writeFile(new URL(`../docs/${filename.replace('.glb','')}-validation.json`, import.meta.url), JSON.stringify(validation,null,2) + '\n');
assert.equal(validation.issues.numErrors,0,JSON.stringify(validation.issues.messages));
assert.equal(validation.issues.numWarnings,0,JSON.stringify(validation.issues.messages));
assert.ok(document.images.every(image => image.bufferView !== undefined && !image.uri));
assert.ok(!document.extensionsUsed.includes('EXT_materials_bump'));
const compatible = filename.includes('compatible');
assert.equal(Boolean(document.extensionsRequired?.includes('EXT_mesh_gpu_instancing')), !compatible);
if (compatible) assert.equal(document.extensionsRequired,undefined);
const gltf = await new GLTFLoader().parseAsync(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), '');
const root = gltf.scene.children.find(object => object.userData.design?.revision === 4);
assert.ok(root);
const metrics = modelMetrics(root);
assert.equal(metrics.triangles,root.userData.geometryMetrics.triangles);
assert.equal(metrics.instances,compatible ? 0 : root.userData.geometryMetrics.instances);
assert.equal(root.userData.detailCounts.roofTiles,9526);
assert.equal(root.userData.detailCounts.grass.blades,345606);
gltf.scene.updateMatrixWorld(true);
const bounds = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
assert.ok(bounds.distanceTo(new THREE.Vector3(...gltf.scene.userData.modelBounds)) < 2e-5);
assert.equal(gltf.cameras.length,1);
let lamps = 0, directionals = 0, colorInstances = 0, portableColors = 0, normalMaps = new Set();
gltf.scene.traverse(object => {
  if (object.isPointLight) lamps++;
  if (object.isDirectionalLight) directionals++;
  if (object.isInstancedMesh && object.instanceColor) colorInstances += object.count;
  if (!object.isMesh) return;
  if (object.geometry.attributes.color) portableColors++;
  if (object.material.normalMap) normalMaps.add(object.material.normalMap);
  if (object.material.map) assert.ok(object.material.map.image.width > 0);
  const normal = object.geometry.attributes.normal;
  for (let i = 0; normal && i < normal.count; i += 137) assert.ok(Math.abs(Math.hypot(normal.getX(i),normal.getY(i),normal.getZ(i)) - 1) < 1e-4);
});
assert.equal(lamps,6); assert.equal(directionals,2); assert.ok(normalMaps.size >= 6);
assert.ok(gltf.scene.getObjectByName('场景环境'));
assert.equal(gltf.scene.userData.exportProfile,compatible ? 'compatible' : 'compact');
if (!compatible) assert.equal(colorInstances,metrics.instances - 2210);
if (compatible) {
  const compactFile = await readFile(new URL('../changyi-pavilion.glb',import.meta.url));
  const compact = await new GLTFLoader().parseAsync(compactFile.buffer.slice(compactFile.byteOffset,compactFile.byteOffset + compactFile.byteLength),'');
  const matrix = new THREE.Matrix4(), tint = new THREE.Color();
  let comparedInstances = 0;
  compact.scene.traverse(object => {
    if (!object.isInstancedMesh) return;
    const group = gltf.scene.getObjectByName(object.name);
    assert.equal(group.userData.expandedInstances,object.count);
    const vertices = object.geometry.attributes.position.count;
    for (const instance of new Set([0,Math.floor(object.count / 2),object.count - 1])) {
      const mesh = group.children.find(child => {
        const start = Number(child.name.split('·').at(-1));
        return instance >= start && instance < start + child.geometry.attributes.position.count / vertices;
      });
      const start = Number(mesh.name.split('·').at(-1));
      object.getMatrixAt(instance,matrix); tint.setRGB(1,1,1);
      if (object.instanceColor) object.getColorAt(instance,tint);
      tint.multiply(object.material.color);
      for (const vertex of [0,Math.floor(vertices / 2),vertices - 1]) {
        const at = (instance - start) * vertices + vertex;
        const expected = new THREE.Vector3().fromBufferAttribute(object.geometry.attributes.position,vertex).applyMatrix4(matrix);
        const actual = new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,at);
        assert.ok(expected.distanceTo(actual) < 2e-5,object.name);
        for (const [axis,channel] of [['getX','r'],['getY','g'],['getZ','b']]) {
          const expectedColor = THREE.MathUtils.clamp(tint[channel] * (object.geometry.attributes.color?.[axis](vertex) ?? 1),0,1);
          assert.ok(Math.abs(mesh.geometry.attributes.color[axis](at) - expectedColor) < .5 / 255 + 1e-6,object.name);
        }
      }
      comparedInstances++;
    }
  });
  const cloths = scene => { const out = []; scene.traverse(object => { if (object.userData.deforming) out.push(object); }); return out; };
  const a = cloths(compact.scene), b = cloths(gltf.scene); assert.equal(a.length,b.length);
  a.forEach((cloth,i) => assert.deepEqual(cloth.geometry.attributes.position.array,b[i].geometry.attributes.position.array));
  console.log(`Cross-profile parity: ${comparedInstances} sampled instances, ${a.length} complete cloth meshes.`);
}
console.log(JSON.stringify({ filename, validatorErrors: validation.issues.numErrors, validatorWarnings: validation.issues.numWarnings, validatorInfos: validation.issues.numInfos, loaderRoundTrip: true, embeddedImages: document.images.length, colorInstances, portableColors, normalMaps: normalMaps.size, lamps, directionals, cameras: gltf.cameras.length, triangles: metrics.triangles, instances: metrics.instances, bytes: file.byteLength, modelBounds: bounds.toArray() },null,2));
