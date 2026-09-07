import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadImage } from '@napi-rs/canvas';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { modelMetrics } from '../src/model-optimization.js';

// Decode the real embedded PNGs and glTF using the same loader shipped by Three.js.
globalThis.self = { URL };
globalThis.createImageBitmap = async blob => loadImage(Buffer.from(await blob.arrayBuffer()));
globalThis.ProgressEvent = class extends Event {
  constructor(type, values) { super(type); Object.assign(this, values); }
};
const file = await readFile(new URL('../changyi-pavilion.glb', import.meta.url));
assert.equal(file.readUInt32LE(0), 0x46546c67);
assert.equal(file.readUInt32LE(4), 2);
assert.equal(file.readUInt32LE(8), file.byteLength);
const document = JSON.parse(file.subarray(20, 20 + file.readUInt32LE(12)).toString());
assert.ok(document.extensionsRequired.includes('EXT_mesh_gpu_instancing'));
assert.ok(document.images.every(image => image.bufferView !== undefined && !image.uri));
const gltf = await new GLTFLoader().parseAsync(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), '');
const root = gltf.scene.children[0], metrics = modelMetrics(root);
assert.equal(metrics.triangles, root.userData.geometryMetrics.triangles);
assert.equal(metrics.instances, 76223);
assert.equal(root.userData.detailCounts.roofTiles, 9526);
gltf.scene.updateMatrixWorld(true);
const bounds = new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3());
assert.ok(bounds.distanceTo(new THREE.Vector3(27.85598373413086, 9.490000247955322, 42.34136724472046)) < 1e-4);
let colorInstances = 0;
gltf.scene.traverse(object => {
  if (object.isInstancedMesh && object.instanceColor) colorInstances += object.count;
  if (object.isMesh && object.material.map) assert.ok(object.material.map.image.width > 0);
});
assert.equal(colorInstances, 76223 - 2210); // Flower centres intentionally share one solid colour.
console.log(JSON.stringify({ validGlbHeader: true, loaderRoundTrip: true, embeddedImages: document.images.length, colorInstances, triangles: metrics.triangles, instances: metrics.instances, bytes: file.byteLength, bounds: bounds.toArray() }, null, 2));
