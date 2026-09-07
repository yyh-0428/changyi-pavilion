import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { buildPavilion } from '../src/model.js';
import { clayTileGeometry, peachLeafGeometry, peachBlossomGeometry, taperedBranchGeometry } from '../src/detail-geometry.js';
import { clipToHexagon } from '../src/architecture-geometry.js';
import { modelMetrics } from '../src/model-optimization.js';
import { installCanvas, loadPlaqueMap } from '../scripts/node-canvas.mjs';

installCanvas();
const model = buildPavilion({ plaqueMap: await loadPlaqueMap() });
const baseline = { triangles: 5032848, geometryBytes: 36944696, meshes: 142 };

function fingerprint(root) {
  const hash = createHash('sha256');
  root.traverse(object => {
    if (!object.isMesh) return;
    for (const attribute of Object.values(object.geometry.attributes)) hash.update(Buffer.from(attribute.array.buffer));
    if (object.geometry.index) hash.update(Buffer.from(object.geometry.index.array.buffer));
    if (object.instanceMatrix) hash.update(Buffer.from(object.instanceMatrix.array.buffer));
    if (object.instanceColor) hash.update(Buffer.from(object.instanceColor.array.buffer));
    hash.update(JSON.stringify(object.matrix.toArray()));
  });
  return hash.digest('hex');
}

test('all geometry, normals, indices and transforms are finite and in range', () => {
  model.root.traverse(object => {
    if (!object.isMesh) return;
    const { geometry } = object;
    for (const attribute of Object.values(geometry.attributes)) {
      assert.ok(attribute.count === geometry.attributes.position.count);
      for (const value of attribute.array) assert.ok(Number.isFinite(value), object.name);
    }
    for (const index of geometry.index?.array ?? []) assert.ok(index < geometry.attributes.position.count, object.name);
    const transforms = object.isInstancedMesh ? object.instanceMatrix.array : object.matrix.elements;
    for (const value of transforms) assert.ok(Number.isFinite(value), object.name);
  });
});

test('new tile shells are closed, correctly wound and have nonzero surface area', () => {
  for (const pan of [false, true]) {
    const geometry = clayTileGeometry(pan), edges = new Map();
    const p = geometry.attributes.position, id = index => [p.getX(index), p.getY(index), p.getZ(index)].map(x => x.toFixed(6)).join(',');
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    let signedVolume = 0;
    for (let i = 0; i < geometry.index.count; i += 3) {
      const triangle = [0, 1, 2].map(j => geometry.index.getX(i + j));
      a.fromBufferAttribute(p, triangle[0]); b.fromBufferAttribute(p, triangle[1]); c.fromBufferAttribute(p, triangle[2]);
      assert.ok(b.clone().sub(a).cross(c.clone().sub(a)).lengthSq() > 1e-14);
      signedVolume += a.dot(b.clone().cross(c)) / 6;
      for (let j = 0; j < 3; j++) {
        const from = id(triangle[j]), to = id(triangle[(j + 1) % 3]), key = [from, to].sort().join('|');
        const edge = edges.get(key) || { count: 0, direction: 0 };
        edge.count++; edge.direction += from < to ? 1 : -1; edges.set(key, edge);
      }
    }
    for (const edge of edges.values()) assert.deepEqual(edge, { count: 2, direction: 0 });
    assert.ok(signedVolume > .07 && signedVolume < .10);
  }
});

test('pointed leaves and cupped petals do not contain collapsed triangles', () => {
  for (const geometry of [peachLeafGeometry(), peachBlossomGeometry()]) {
    const p = geometry.attributes.position;
    for (let i = 0; i < geometry.index.count; i += 3) {
      const [a, b, c] = [0, 1, 2].map(j => new THREE.Vector3().fromBufferAttribute(p, geometry.index.getX(i + j)));
      assert.ok(b.sub(a).cross(c.sub(a)).lengthSq() > 1e-16);
    }
  }
});

test('branch UV seam has matching positions and normals at every radius tier', () => {
  for (const [radius, sides] of [[.245, 10], [.026, 8], [.008, 5]]) {
    const geometry = taperedBranchGeometry([new THREE.Vector3(), new THREE.Vector3(.2, .8, .1), new THREE.Vector3(.4, 1.5, 0)], radius, .0015, 12);
    for (let ring = 0; ring <= 12; ring++) for (const attribute of ['position', 'normal']) {
      const values = geometry.attributes[attribute];
      const a = new THREE.Vector3().fromBufferAttribute(values, ring * (sides + 1));
      const b = new THREE.Vector3().fromBufferAttribute(values, ring * (sides + 1) + sides);
      assert.ok(a.distanceTo(b) < 1e-6);
    }
  }
});

test('paving clips to six straight faces, including exact boundary contacts', () => {
  const radius = 3.74, apothem = radius * Math.cos(Math.PI / 6);
  for (let row = -6; row <= 5; row++) for (let column = -4; column <= 4; column++) {
    const x = column * 1.04, z = row * .62;
    const polygon = clipToHexagon([[x,z],[x+1.04,z],[x+1.04,z+.62],[x,z+.62]].map(p => new THREE.Vector2(...p)), radius);
    for (const p of polygon) for (let side = 0; side < 6; side++) {
      const angle = Math.PI / 6 + side * Math.PI / 3;
      assert.ok(p.x * Math.cos(angle) + p.y * Math.sin(angle) <= apothem + 1e-7);
    }
  }
  assert.equal(clipToHexagon([[4,4],[5,4],[5,5],[4,5]].map(p => new THREE.Vector2(...p)), radius).length, 0);
});

test('roof deck is visible from above and has a soffit at the specified depth', () => {
  model.root.updateMatrixWorld(true);
  const theta = Math.PI / 6, r = 3.0, x = Math.cos(theta) * r, z = Math.sin(theta) * r;
  const backing = [], soffits = [];
  model.root.traverse(object => {
    if (object.isMesh && !object.isInstancedMesh && object.parent.name === '六角重檐亭') {
      if (object.material.name === 'tileDark') backing.push(object);
      if (object.material.name === 'darkWood') soffits.push(object);
    }
  });
  const top = new THREE.Raycaster(new THREE.Vector3(x, 10, z), new THREE.Vector3(0,-1,0)).intersectObjects(backing)[0];
  assert.ok(top && top.face.normal.y > 0);
  const underside = new THREE.Raycaster(new THREE.Vector3(x, top.point.y - .1, z), new THREE.Vector3(0,1,0)).intersectObjects(soffits)[0];
  assert.ok(underside && underside.face.normal.y < 0);
  assert.ok(Math.abs(top.point.y - underside.point.y - .055) < 1e-5);
});

test('geometry budget improves without removing tiles or garden instances', () => {
  const metrics = modelMetrics(model.root);
  assert.ok(metrics.triangles < baseline.triangles * .5);
  assert.ok(metrics.geometryBytes < baseline.geometryBytes * .45);
  assert.ok(metrics.meshes < baseline.meshes);
  const counts = model.root.userData.detailCounts;
  assert.deepEqual([counts.roofTiles, counts.branches, counts.leaves, counts.blossoms], [9526, 1044, 4752, 2210]);
  assert.deepEqual([counts.grass.island, counts.grass.arrival, counts.grass.blades], [6118, 51483, 345606]);
  const size = new THREE.Box3().setFromObject(model.root).getSize(new THREE.Vector3());
  assert.ok(size.distanceTo(new THREE.Vector3(27.85598373413086, 9.490000247955322, 42.34136724472046)) < 1e-5);
});

test('rebuilding in one session gives identical geometry and placement', async () => {
  const rebuilt = buildPavilion({ plaqueMap: await loadPlaqueMap() });
  assert.equal(fingerprint(model.root), fingerprint(rebuilt.root));
});

test('cloth uniforms advance without uploading vertices; lantern light follows its pivot', () => {
  const cloths = [];
  model.root.traverse(object => { if (object.userData.deforming) cloths.push(object); });
  const versions = cloths.map(cloth => cloth.geometry.attributes.position.version);
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader };
  cloths[0].material.onBeforeCompile(shader);
  assert.ok(shader.vertexShader.includes('objectNormal.y -= objectNormal.z * clothWave(position.y).y;'));
  model.update(2.3);
  assert.equal(shader.uniforms.uClothTime.value, 2.3);
  assert.deepEqual(cloths.map(cloth => cloth.geometry.attributes.position.version), versions);
  const lamps = [];
  model.root.traverse(object => { if (object.name === '悬灯') lamps.push(object); });
  lamps.forEach((lamp, i) => {
    const center = new THREE.Vector3(0, -.53, 0).applyMatrix4(lamp.matrixWorld);
    assert.ok(center.distanceTo(model.lightPositions[i]) < 1e-8);
  });
});
