import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { conformalTileGeometry, roofPoint, tileElevation } from '../src/roof-geometry.js';
import { hexRingGeometry, joinedLatticeGeometry, pathSlabGeometry, dressedPathSlabGeometry, pavingStoneGeometry, clipToHexagon } from '../src/architecture-geometry.js';
import { snapshotGeometry, captureScene, expandInstances } from '../src/export-scene.js';
import { createWaterSnapshot } from '../src/scene-context.js';

function closedVolume(geometry) {
  const p = geometry.attributes.position, index = geometry.index, edges = new Map();
  const count = index?.count ?? p.count, point = i => new THREE.Vector3().fromBufferAttribute(p, index ? index.getX(i) : i);
  let volume = 0;
  for (let i = 0; i < count; i += 3) {
    const vertices = [point(i), point(i + 1), point(i + 2)];
    const [a,b,c] = vertices;
    assert.ok(b.clone().sub(a).cross(c.clone().sub(a)).lengthSq() > 1e-16);
    volume += a.dot(b.clone().cross(c)) / 6;
    for (let j = 0; j < 3; j++) {
      const from = vertices[j].toArray().map(x => x.toFixed(6)).join(','), to = vertices[(j + 1) % 3].toArray().map(x => x.toFixed(6)).join(',');
      const key = [from,to].sort().join('|'), value = edges.get(key) ?? [0,0];
      value[0]++; value[1] += from < to ? 1 : -1; edges.set(key, value);
    }
  }
  for (const value of edges.values()) assert.deepEqual(value, [2,0]);
  assert.ok(volume > 0); return volume;
}

test('conformal tiles stay closed at the narrow crown and wide eave, with clearance at laps', () => {
  for (const spec of [{ inner: .20, outer: 2.49, base: 6.12, height: 1.81, rows: 14, lanes: 17 }, { inner: 1, outer: 4.66, base: 4.48, height: 1.94, rows: 21, lanes: 27 }]) {
    for (const row of [0,1,spec.rows - 1]) for (const pan of [true,false]) {
      const geometry = conformalTileGeometry({ ...spec, row, column: 1, pan }); closedVolume(geometry);
      const t0 = Math.max(0, (row - .22) / spec.rows), t1 = (row + 1) / spec.rows;
      const nx = pan ? 4 : 6, laneWidth = (spec.inner + (spec.outer - spec.inner) * (t0 + t1) / 2) / spec.lanes;
      for (let z = 0; z <= 2; z++) for (let x = 0; x <= nx; x++) {
        const center = (pan ? 1.5 : 1) / spec.lanes, half = (pan ? .475 : .26) / spec.lanes;
        const expected = roofPoint(0, THREE.MathUtils.lerp(t0,t1,z / 2), center + (x / nx * 2 - 1) * half, spec.inner,spec.outer,spec.base,spec.height);
        const actual = new THREE.Vector3().fromBufferAttribute(geometry.attributes.position,z * (nx + 1) + x);
        assert.ok(Math.abs(actual.y - expected.y - tileElevation(x / nx,z / 2,pan,laneWidth)) < 1e-6);
      }
    }
    for (let row = 0; row < spec.rows - 1; row++) for (const pan of [true,false]) {
      const t0 = Math.max(0,(row - .22) / spec.rows), t1 = (row + 1) / spec.rows, next0 = (row + .78) / spec.rows, next1 = (row + 2) / spec.rows;
      const width = (spec.inner + (spec.outer - spec.inner) * (t0 + t1) / 2) / spec.lanes;
      const nextWidth = (spec.inner + (spec.outer - spec.inner) * (next0 + next1) / 2) / spec.lanes;
      for (const t of [next0,(next0 + t1) / 2,t1]) for (const x of [0,.5,1]) {
        assert.ok(tileElevation(x,(t - t0) / (t1 - t0),pan,width,true) - tileElevation(x,(t - next0) / (next1 - next0),pan,nextWidth) > .001);
      }
    }
  }
});

test('hex beam mitres and curved slabs enclose a single correctly wound solid', () => {
  const r = 3.14, w = .23, h = .29;
  const expected = 3 * Math.sqrt(3) / 2 * ((r + w / Math.sqrt(3)) ** 2 - (r - w / Math.sqrt(3)) ** 2) * h;
  assert.ok(Math.abs(closedVolume(hexRingGeometry(r,w,h)) - expected) < 1e-6);
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0,0,0),new THREE.Vector3(1,.2,2),new THREE.Vector3(2,0,5)]);
  closedVolume(pathSlabGeometry(curve,.2,.3,-.5,.5,.1));
  const landing = pathSlabGeometry(curve,.2,.3,-.5,.5,.1,{ point: new THREE.Vector3(0,0,1),across: new THREE.Vector3(1,0,0) });
  closedVolume(landing);
  for (const i of [0,1,6,7]) assert.equal(landing.attributes.position.getZ(i),1);
});

test('cross lattice has one member at the crossing and no doubled centre faces', () => {
  const mesh = new THREE.Mesh(joinedLatticeGeometry(.34,.41),new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })); mesh.updateMatrixWorld(true);
  const hits = new THREE.Raycaster(new THREE.Vector3(.004,.003,1),new THREE.Vector3(0,0,-1)).intersectObject(mesh);
  assert.equal(hits.length,2); assert.ok(Math.abs(hits[1].distance - hits[0].distance - .033) < 1e-7);
});

test('dressed stones remain closed on straight and curved paths, and at all 77 clipped floor boundaries', () => {
  for (const curve of [
    new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, .4, 3), new THREE.Vector3(0, 0, 6)]),
    new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, .02, 3), new THREE.Vector3(3, .03, 5)]),
  ]) {
    const geometry = dressedPathSlabGeometry(curve, .30, .36, -.7, .7, .12);
    closedVolume(geometry);
    const original = pathSlabGeometry(curve, .30, .36, -.7, .7, .12);
    original.computeBoundingBox();
    for (let i = 0; i < geometry.attributes.position.count; i++) {
      assert.ok(original.boundingBox.clone().expandByScalar(1e-6).containsPoint(new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, i)));
    }
  }
  let stones = 0;
  for (let row = -6; row <= 5; row++) for (let column = -4; column <= 4; column++) {
    const x = column * 1.04 + (Math.abs(row) % 2) * .52, z = row * .62;
    const points = clipToHexagon([[x + .006, z + .006], [x + 1.034, z + .006], [x + 1.034, z + .614], [x + .006, z + .614]].map(p => new THREE.Vector2(...p)), 3.74);
    if (points.length < 3 || Math.abs(THREE.ShapeUtils.area(points)) < .001) continue;
    closedVolume(pavingStoneGeometry(points)); stones++;
  }
  assert.equal(stones, 77);
});

test('snapshot decodes half-float UVs and bakes cloth without changing the source', () => {
  const geometry = new THREE.PlaneGeometry(1,2.59,2,4), original = geometry.attributes.position.array.slice();
  const uv = new THREE.Float16BufferAttribute(new Uint16Array(geometry.attributes.uv.count * 2),2);
  for (let i = 0; i < uv.count; i++) uv.setXY(i,.37,.62); geometry.setAttribute('uv',uv);
  geometry.setAttribute('clothPhase',new THREE.Float32BufferAttribute(new Float32Array(original.length / 3).fill(.7),1));
  const snapshot = snapshotGeometry(geometry,2.3);
  assert.ok(Math.abs(snapshot.attributes.uv.getX(0) - uv.getX(0)) < 1 / 65535);
  assert.ok(Math.abs(snapshot.attributes.uv.getY(0) - uv.getY(0)) < 1 / 65535);
  assert.deepEqual(geometry.attributes.position.array,original);
  assert.equal(snapshot.attributes.clothPhase,undefined);
  for (let i = 0; i < snapshot.attributes.position.count; i++) {
    const y = geometry.attributes.position.getY(i), expected = (Math.sin(y * 2 + 2.3 * .72 + .7) * .08 + Math.sin(2.3 * .44 + .7) * .035) * (1.295 - y) / 2.59;
    assert.ok(Math.abs(snapshot.attributes.position.getZ(i) - expected) < 1e-7);
  }
});

test('portable expansion preserves transforms, normals and multiplied colours within 8-bit tolerance', async () => {
  const root = new THREE.Group(); root.userData.detailCounts = {};
  const geometry = new THREE.BoxGeometry(1,2,3);
  const material = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(.4,.3,.2) });
  const instanced = new THREE.InstancedMesh(geometry,material,2); root.add(instanced);
  const matrix = new THREE.Matrix4().compose(new THREE.Vector3(2,3,4),new THREE.Quaternion().setFromEuler(new THREE.Euler(.2,.4,.1)),new THREE.Vector3(.8,1.4,.6));
  instanced.setMatrixAt(0,matrix); instanced.setMatrixAt(1,new THREE.Matrix4());
  instanced.setColorAt(0,new THREE.Color().setRGB(1.2,.8,1)); instanced.setColorAt(1,new THREE.Color().setRGB(.9,1.1,1));
  const light = new THREE.DirectionalLight(); light.position.set(-12,16,8);
  const scene = captureScene(root,{ includeContext: true, objects: [light] });
  const copied = scene.children[0].children[0];
  geometry.attributes.position.setX(0,99); instanced.setColorAt(0,new THREE.Color('red'));
  assert.notEqual(copied.geometry.attributes.position.getX(0),99);
  await expandInstances(scene);
  const mesh = scene.children[0].children[0].children[0], p = new THREE.Vector3().fromBufferAttribute(copied.geometry.attributes.position,0).applyMatrix4(matrix);
  assert.ok(p.distanceTo(new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,0)) < 1e-6);
  assert.ok(Math.abs(mesh.geometry.attributes.color.getX(0) - .48) <= .5 / 255);
  assert.ok(Math.abs(mesh.geometry.attributes.color.getY(0) - .24) <= .5 / 255);
  const originalNormal = new THREE.Vector3().fromBufferAttribute(copied.geometry.attributes.normal,0).applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(matrix));
  assert.ok(originalNormal.distanceTo(new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.normal,0)) < 1e-6);
  assert.equal(material.color.r,.4);
  const exportedLight = scene.children[1].children.find(object => object.isDirectionalLight);
  const direction = new THREE.Vector3(0,0,-1).applyQuaternion(exportedLight.quaternion);
  assert.ok(direction.distanceTo(light.position.clone().negate().normalize()) < 1e-7);
});

test('water snapshot matches both live large-wave displacement terms at the captured time', () => {
  const water = createWaterSnapshot(2.3), p = water.geometry.attributes.position;
  for (const i of [0,111,9271,p.count - 1]) {
    const x = p.getX(i), z = p.getZ(i), y = -.15 + Math.sin(x * .83 + z * .37 - 2.3 * .77) * .014 + Math.sin(x * -.49 + z * 1.17 - 2.3 * .95) * .008;
    assert.ok(Math.abs(p.getY(i) - y) < 1e-7);
  }
});
