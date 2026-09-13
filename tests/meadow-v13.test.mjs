import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createMeadowMaterial, meadowCoverage, updateMeadowVisibility, meadowDetailTexture } from '../src/meadow-rendering.js';
import { grassClumpGeometry, meadowTexture } from '../src/detail-geometry.js';
import { loadSurfaceImages, optionalAsset } from '../src/material-assets.js';
import { captureScene } from '../src/export-scene.js';
import { installCanvas } from '../scripts/node-canvas.mjs';

installCanvas();

test('near blades remain whole, distant subpixel blades retire smoothly at both drawing densities', () => {
  for (const height of [900, 844 * 1.6]) {
    const focal = height / (2 * Math.tan(39 * Math.PI / 360));
    assert.equal(meadowCoverage(3, focal), 1);
    assert.equal(meadowCoverage(80, focal), 0);
    let previous = 1;
    for (let distance = 3; distance < 100; distance += .01) {
      const coverage = meadowCoverage(distance, focal);
      assert.ok(coverage <= previous && previous - coverage < .004, `discontinuity at ${distance}`);
      previous = coverage;
    }
  }
});

test('patch culling preserves every resolvable tuft, including transformed patch edges, and recovers on approach', () => {
  const { material, uniforms } = createMeadowMaterial(), root = new THREE.Group();
  const mesh = new THREE.InstancedMesh(grassClumpGeometry(), material, 3);
  mesh.userData.meadow = true; root.add(mesh); root.position.set(4, 0, -3); root.rotation.y = .9;
  for (let i = 0; i < 3; i++) mesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(i * 2, 0, 0));
  mesh.computeBoundingSphere(); root.updateMatrixWorld(true);
  const camera = new THREE.PerspectiveCamera(39, 1.6, .1, 800), states = [{ mesh }];
  const matrix = new THREE.Matrix4(), point = new THREE.Vector3();
  for (let distance = 1; distance <= 200; distance += .5) {
    camera.position.set(distance, 2, 0); camera.updateMatrixWorld();
    updateMeadowVisibility(states, uniforms, camera, 900);
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix); point.setFromMatrixPosition(matrix).applyMatrix4(mesh.matrixWorld);
      if (meadowCoverage(camera.position.distanceTo(point), uniforms.meadowFocal.value) > 0) assert.equal(mesh.visible, true);
    }
  }
  assert.equal(mesh.visible, false);
  camera.position.copy(root.position).add(new THREE.Vector3(0, 2, 1)); camera.updateMatrixWorld();
  updateMeadowVisibility(states, uniforms, camera, 900); assert.equal(mesh.visible, true);
  mesh.visible = false;
  const snapshot = captureScene(root, { includeContext: false });
  assert.equal(snapshot.children[0].children[0].visible, true, 'export cannot lose far grass because of the current camera');
  assert.equal(mesh.visible, false, 'capture leaves the live culling state intact');
});

test('macro colour has no baked speckle and the local fibre map repeats independently', () => {
  const texture = meadowTexture(), detail = meadowDetailTexture();
  const pixels = texture.image.getContext('2d').getImageData(0, 0, 1024, 1024).data;
  let strongest = 0;
  for (let y = 1; y < 1024; y++) for (let x = 1; x < 1024; x++) {
    const i = (y * 1024 + x) * 4;
    strongest = Math.max(strongest, Math.abs(pixels[i + 1] - pixels[i - 3]), Math.abs(pixels[i + 1] - pixels[i - 4095]));
  }
  assert.ok(strongest <= 3, `isolated macro texture impulse: ${strongest}`);
  assert.deepEqual(texture.repeat.toArray(), [1, 1]);
  assert.deepEqual(detail.repeat.toArray(), [32, 32]);
  assert.equal(detail.image.width, 256);
  assert.equal(detail.colorSpace, THREE.NoColorSpace);
});

test('one missing or stalled asset leaves the remaining authored surfaces available', async () => {
  const wood = { image: 'wood' }, tile = { image: 'tile' };
  const surfaces = await loadSurfaceImages('/garden/', async url => {
    if (url.includes('bark')) throw new Error('simulated missing bark');
    return url.includes('timber') ? wood : tile;
  });
  assert.equal(surfaces.wood, wood); assert.equal(surfaces.tile, tile); assert.equal(surfaces.bark, undefined);
  assert.equal(await optionalAsset(() => new Promise(() => {}), () => 'local', 10), 'local');
});
