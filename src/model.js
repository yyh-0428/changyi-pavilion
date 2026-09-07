import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { clayTileGeometry, taperedBranchGeometry, peachLeafGeometry, peachLeafTexture, peachBlossomGeometry, meadowNoise, meadowTexture, grassClumpGeometry } from './detail-geometry.js';
import { clipToHexagon, pavingStoneGeometry, columnBaseGeometry, timberColumnGeometry, bracketArmGeometry, bridgeHeight, archStoneGeometry } from './architecture-geometry.js';
import { batchModel, modelMetrics } from './model-optimization.js';

const TAU = Math.PI * 2;
let seed = 48;
const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const v = (x, y, z) => new THREE.Vector3(x, y, z);

function surfaceTexture(kind) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const pixels = ctx.createImageData(512, 512);
  for (let y = 0; y < 512; y++) {
    for (let x = 0; x < 512; x++) {
      const i = (y * 512 + x) * 4;
      let value;
      if (kind === 'wood') {
        const grain = Math.sin(x * .7 + Math.sin(y * .012) * 2 + Math.sin(x * .055) * 4);
        value = 193 + grain * 6 + Math.sin(x * 2.4 + y * .004) * 3 + random() * 8;
      } else if (kind === 'tile') {
        const rim = y < 14 ? 23 * (1 - y / 14) : 0;
        value = 207 - rim + (random() - .5) * 28;
      } else value = 204 + (random() - .5) * 45;
      pixels.data[i] = value;
      pixels.data[i + 1] = value;
      pixels.data[i + 2] = value;
      pixels.data[i + 3] = 255;
    }
  }
  ctx.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function plaqueTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 320;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#233d35'; ctx.fillRect(0, 0, 1024, 320);
  ctx.strokeStyle = '#c4a86a'; ctx.lineWidth = 4; ctx.strokeRect(17, 17, 990, 286);
  ctx.strokeStyle = '#7f7953'; ctx.lineWidth = 2; ctx.strokeRect(29, 29, 966, 262);
  ctx.font = '192px "Songti SC", "STSong", serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#e4cf99';
  ctx.fillText('长衣亭', 512, 174);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function rockGeometry(radius) {
  const geometry = new THREE.IcosahedronGeometry(radius, 2);
  const positions = geometry.attributes.position;
  const phase = random() * 10;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i) / radius, y = positions.getY(i) / radius, z = positions.getZ(i) / radius;
    const ridge = 1 + Math.sin(x * 5.8 + z * 3.2 + phase) * .12 + Math.cos(y * 7.2 - x * 2.1) * .085;
    positions.setXYZ(i, x * radius * ridge, Math.max(-.6, y * ridge) * radius, z * radius * ridge);
  }
  geometry.deleteAttribute('normal');
  const smooth = mergeVertices(geometry, .0001); smooth.computeVertexNormals(); geometry.dispose(); return smooth;
}

export function buildPavilion({ plaqueMap } = {}) {
  seed = 48; // Every rebuild/export starts from the same garden and tile distribution.
  const root = new THREE.Group(); root.name = '长衣亭 · 予张依婷';
  const pavilion = new THREE.Group(); pavilion.name = '六角重檐亭'; root.add(pavilion);
  const garden = new THREE.Group(); garden.name = '临水桃花庭'; root.add(garden);
  const woodMap = surfaceTexture('wood');
  const stoneMap = surfaceTexture('stone');
  const tileMap = surfaceTexture('tile');
  const meadowMap = meadowTexture();
  const mats = {
    wood: new THREE.MeshStandardMaterial({ color: '#8f4b3d', map: woodMap, bumpMap: woodMap, bumpScale: .012, roughness: .58 }),
    darkWood: new THREE.MeshStandardMaterial({ color: '#49342a', map: woodMap, roughness: .76 }),
    stone: new THREE.MeshStandardMaterial({ color: '#c4c5b9', map: stoneMap, bumpMap: stoneMap, bumpScale: .045, roughness: .93 }),
    stoneDark: new THREE.MeshStandardMaterial({ color: '#838f82', map: stoneMap, bumpMap: stoneMap, bumpScale: .035, roughness: .94 }),
    tile: new THREE.MeshPhysicalMaterial({ color: '#454b48', map: tileMap, roughness: .76, metalness: .01, clearcoat: .06, clearcoatRoughness: .65, bumpMap: tileMap, bumpScale: .009 }),
    tileLight: new THREE.MeshStandardMaterial({ color: '#69716c', map: tileMap, roughness: .74, metalness: .015, bumpMap: tileMap, bumpScale: .007 }),
    tileDark: new THREE.MeshStandardMaterial({ color: '#353b37', roughness: .8 }),
    brass: new THREE.MeshStandardMaterial({ color: '#b89a62', roughness: .43, metalness: .6 }),
    soil: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, map: meadowMap, bumpMap: meadowMap, bumpScale: .025 }),
    bark: new THREE.MeshStandardMaterial({ color: '#675849', roughness: 1, map: woodMap, bumpMap: woodMap, bumpScale: .045 }),
    leaf: new THREE.MeshStandardMaterial({ color: '#71886b', roughness: .85, side: THREE.DoubleSide }),
    lantern: new THREE.MeshStandardMaterial({ color: '#eedcaf', roughness: .75, emissive: '#ffbf70', emissiveIntensity: .25 }),
  };
  for (const [name, material] of Object.entries(mats)) material.name = name;
  const lanterns = [], lightPositions = [], clothTime = { value: 0 };
  const detailCounts = { roofTiles: 0, branches: 0, leaves: 0, blossoms: 0, pavingStones: 0 };

  function mesh(geometry, material, pos, parent = pavilion) {
    const m = new THREE.Mesh(geometry, material);
    if (pos) m.position.copy(pos);
    m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }
  function box(w, h, d, x, y, z, material = mats.wood, parent = pavilion) {
    return mesh(new THREE.BoxGeometry(w, h, d), material, v(x, y, z), parent);
  }
  function cylinder(rt, rb, h, x, y, z, material, segments = 24, parent = pavilion) {
    return mesh(new THREE.CylinderGeometry(rt, rb, h, segments), material, v(x, y, z), parent);
  }
  function beam(a, b, width, height, material = mats.wood, parent = pavilion) {
    const m = box(width, height, a.distanceTo(b), ...a.clone().add(b).multiplyScalar(.5).toArray(), material, parent);
    if (material === mats.wood || material === mats.darkWood) {
      const { position, normal, uv } = m.geometry.attributes;
      for (let i = 0; i < position.count; i++) {
        const cross = Math.abs(normal.getX(i)) > .5 ? position.getY(i) / height : position.getX(i) / width;
        uv.setXY(i, cross + .5, position.getZ(i) / a.distanceTo(b) + .5);
      }
    }
    m.quaternion.setFromUnitVectors(v(0, 0, 1), b.clone().sub(a).normalize());
    return m;
  }
  function tube(points, radius, material, parent = pavilion, tubularSegments = 24, radialSegments = 6) {
    const curve = new THREE.CatmullRomCurve3(points);
    return mesh(new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false), material, null, parent);
  }
  function meadowUV(geometry) {
    const { position, uv } = geometry.attributes;
    for (let i = 0; i < position.count; i++) uv.setXY(i, position.getX(i) / 64 + .5, -position.getZ(i) / 64 + .5);
    return geometry;
  }

  for (const [radius, height, y, mat] of [[4.18, .26, .03, mats.stoneDark], [4.02, .34, .32, mats.stone], [3.91, .12, .55, mats.stone], [3.87, .06, .64, mats.stoneDark]]) {
    cylinder(radius, radius + .025, height, 0, y, 0, mat, 6).rotation.y = Math.PI / 6;
  }
  for (let i = 0; i < 3; i++) box(2.25 + i * .1, .18, .58, 0, .49 - i * .18, 3.6 + i * .49, mats.stone);

  // Running-bond slabs stop exactly at the hexagonal margin; joints expose the bed.
  for (let row = -6; row <= 5; row++) for (let column = -4; column <= 4; column++) {
    const x = column * 1.04 + (Math.abs(row) % 2) * .52, z = row * .62;
    const points = clipToHexagon([
      new THREE.Vector2(x + .006, z + .006), new THREE.Vector2(x + 1.034, z + .006),
      new THREE.Vector2(x + 1.034, z + .614), new THREE.Vector2(x + .006, z + .614),
    ], 3.74);
    if (points.length < 3 || Math.abs(THREE.ShapeUtils.area(points)) < .001) continue;
    mesh(pavingStoneGeometry(points), mats.stone, v(0, .671, 0)).name = '六角裁边·错缝铺石';
    detailCounts.pavingStones++;
  }

  const corners = Array.from({ length: 6 }, (_, i) => v(Math.cos(i * TAU / 6) * 3.14, 0, Math.sin(i * TAU / 6) * 3.14));
  const baseGeometry = columnBaseGeometry(), columnGeometry = timberColumnGeometry();
  const bracketGeometries = Array.from({ length: 3 }, (_, tier) => bracketArmGeometry(.56 + tier * .22));
  for (let i = 0; i < 6; i++) {
    const p = corners[i], q = corners[(i + 1) % 6];
    mesh(baseGeometry, mats.stone, v(p.x, .69, p.z)).name = '柱础·鼓墩与收分';
    mesh(columnGeometry, mats.wood, v(p.x, .95, p.z)).name = '木柱·微鼓收分';
    cylinder(.186, .186, .055, p.x, 1.04, p.z, mats.brass, 24);
    cylinder(.184, .184, .08, p.x, 4.17, p.z, mats.brass, 24);
    beam(v(p.x, 4.27, p.z), v(q.x, 4.27, q.z), .23, .29);
    const innerP = p.clone().multiplyScalar(.82), innerQ = q.clone().multiplyScalar(.82);
    beam(v(innerP.x, 4.44, innerP.z), v(innerQ.x, 4.44, innerQ.z), .20, .21, mats.darkWood);
    for (const [start, end] of [[p, q], [q, p]]) {
      const direction = end.clone().sub(start).normalize();
      beam(v(start.x, 3.5, start.z), v(start.x + direction.x * .64, 4.21, start.z + direction.z * .64), .105, .13);
      const bracketShape = new THREE.Shape();
      bracketShape.moveTo(0, 0); bracketShape.lineTo(.65, 0);
      bracketShape.bezierCurveTo(.57, -.14, .32, -.15, .15, -.43); bracketShape.lineTo(0, -.43); bracketShape.closePath();
      const bracket = mesh(new THREE.ExtrudeGeometry(bracketShape, { depth: .09, bevelEnabled: true, bevelThickness: .012, bevelSize: .012, bevelSegments: 2, steps: 1 }), mats.wood, v(start.x + direction.x * .06, 4.05, start.z + direction.z * .06));
      bracket.rotation.y = -Math.atan2(direction.z, direction.x);
    }
    beam(v(p.x, 3.96, p.z), v(q.x, 3.96, q.z), .095, .105, mats.darkWood);
    for (let j = 1; j < 12; j++) {
      const point = p.clone().lerp(q, j / 12);
      const fret = box(.036, .21, .045, point.x, 4.09, point.z, j % 3 === 0 ? mats.brass : mats.wood);
      fret.rotation.y = -i * TAU / 6;
    }
    const angle = i * TAU / 6;
    for (let tier = 0; tier < 3; tier++) {
      const length = .56 + tier * .22;
      const arm = mesh(bracketGeometries[tier], mats.wood, v(p.x, 4.44 + tier * .11, p.z));
      arm.rotation.y = -angle;
      const cross = box(.14, .1, length * .75, p.x, 4.49 + tier * .11, p.z);
      cross.rotation.y = -angle;
      for (const sign of [-1, 1]) {
        const tip = v(p.x + Math.cos(angle) * sign * (length * .5 - .05), 4.50 + tier * .11, p.z + Math.sin(angle) * sign * (length * .5 - .05));
        box(.12, .105, .15, ...tip.toArray(), mats.darkWood).rotation.y = -angle;
      }
    }
    box(.30, .15, .30, p.x, 4.38, p.z, mats.darkWood).rotation.y = -angle;
    if (i !== 1) {
      const insetP = p.clone().lerp(q, .07), insetQ = p.clone().lerp(q, .93);
      for (const y of [1.02, 1.57]) beam(v(insetP.x, y, insetP.z), v(insetQ.x, y, insetQ.z), .105, .09);
      for (let j = 0; j <= 6; j++) {
        const r = insetP.clone().lerp(insetQ, j / 6);
        box(.066, .6, .066, r.x, 1.3, r.z);
      }
      for (let j = 0; j < 6; j++) {
        const a = insetP.clone().lerp(insetQ, (j + .1) / 6), b = insetP.clone().lerp(insetQ, (j + .9) / 6);
        beam(v(a.x, 1.08, a.z), v(b.x, 1.49, b.z), .033, .033, mats.darkWood);
        beam(v(a.x, 1.49, a.z), v(b.x, 1.08, b.z), .033, .033, mats.darkWood);
      }
      const bp = p.clone().multiplyScalar(.86), bq = q.clone().multiplyScalar(.86);
      beam(v(bp.x, 1.16, bp.z), v(bq.x, 1.16, bq.z), .38, .1, mats.darkWood);
    }
    beam(v(p.x, 4.38, p.z), v(0, 5.42, 0), .14, .16, mats.darkWood);
  }
  cylinder(.16, .16, 1.34, 0, 5.27, 0, mats.darkWood);
  for (let level = 0; level < 3; level++) {
    const r = 2.4 - level * .58, y = 4.46 + level * .34;
    for (let i = 0; i < 6; i++) {
      const a = i * TAU / 6, b = (i + 1) * TAU / 6;
      beam(v(Math.cos(a) * r, y, Math.sin(a) * r), v(Math.cos(b) * r, y, Math.sin(b) * r), .13, .16, mats.darkWood);
      if (level < 2) beam(v(Math.cos(a) * r, y, Math.sin(a) * r), v(Math.cos(a) * (r - .58), y + .34, Math.sin(a) * (r - .58)), .075, .12, mats.wood);
    }
  }

  function roofPoint(sector, t, u, inner, outer, base, height) {
    const a = sector * TAU / 6, b = (sector + 1) * TAU / 6;
    const radius = inner + (outer - inner) * t;
    const x = THREE.MathUtils.lerp(Math.cos(a), Math.cos(b), u) * radius;
    const z = THREE.MathUtils.lerp(Math.sin(a), Math.sin(b), u) * radius;
    const curl = .10 * t ** 7 + .34 * t ** 4 * Math.abs(2 * u - 1) ** 6;
    return v(x, base + height * (1 - t) ** 1.75 + curl, z);
  }

  function buildRoof(inner, outer, base, height, ridgeCount) {
    const position = (s, t, u) => roofPoint(s, t, u, inner, outer, base, height);
    const rows = outer > 3 ? 21 : 14;
    const capMatrices = [], panMatrices = [], capColors = [], panColors = [];
    const createTile = (sector, row, u, pan) => {
      const t0 = Math.max(.006, (row - .25) / rows), t1 = (row + 1) / rows;
      const start = position(sector, t0, u), end = position(sector, t1, u);
      const middle = start.clone().lerp(end, .5);
      const cross = position(sector, (t0 + t1) / 2, Math.max(0, u - .002)).sub(position(sector, (t0 + t1) / 2, Math.min(1, u + .002))).normalize();
      const along = end.clone().sub(start).normalize();
      const normal = along.clone().cross(cross).normalize();
      cross.crossVectors(normal, along).normalize();
      const width = (inner + (outer - inner) * (t0 + t1) / 2) / ridgeCount;
      middle.addScaledVector(normal, pan ? .025 : .036);
      const matrix = new THREE.Matrix4().makeBasis(cross, normal, along);
      matrix.scale(v(width * (pan ? 1.045 : .55), width * (pan ? 1.045 : .55), start.distanceTo(end)));
      matrix.setPosition(middle);
      const shade = .73 + random() * .34;
      const color = new THREE.Color().setRGB(shade, shade * (.97 + random() * .05), shade * .95);
      (pan ? panMatrices : capMatrices).push(matrix); (pan ? panColors : capColors).push(color);
    };
    for (let sector = 0; sector < 6; sector++) {
      const vertices = [], uv = [], indices = [];
      const rings = 22, columns = 24;
      for (let y = 0; y <= rings; y++) {
        for (let x = 0; x <= columns; x++) {
          vertices.push(...position(sector, y / rings, x / columns).toArray());
          uv.push(x / columns, y / rings);
          if (y < rings && x < columns) {
            const a = y * (columns + 1) + x, b = a + columns + 1;
            indices.push(a, b, a + 1, b, b + 1, a + 1);
          }
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      // Original winding faces the interior. Give the deck a top, soffit and fascia.
      const soffit = geo.clone();
      soffit.setIndex(indices); soffit.translate(0, -.055, 0); soffit.computeVertexNormals();
      mesh(soffit, mats.darkWood).name = '屋面望板·檐下';
      const topIndices = indices.slice();
      for (let i = 0; i < topIndices.length; i += 3) [topIndices[i + 1], topIndices[i + 2]] = [topIndices[i + 2], topIndices[i + 1]];
      geo.setIndex(topIndices); geo.computeVertexNormals(); mesh(geo, mats.tileDark).name = '屋面基层';
      const boundary = [];
      for (let x = 0; x <= columns; x++) boundary.push(x);
      for (let y = 1; y <= rings; y++) boundary.push(y * (columns + 1) + columns);
      for (let x = columns - 1; x >= 0; x--) boundary.push(rings * (columns + 1) + x);
      for (let y = rings - 1; y > 0; y--) boundary.push(y * (columns + 1));
      const edgeVertices = [], edgeUV = [], edgeIndices = [];
      for (let i = 0; i < boundary.length; i++) {
        const a = new THREE.Vector3().fromArray(vertices, boundary[i] * 3);
        const b = new THREE.Vector3().fromArray(vertices, boundary[(i + 1) % boundary.length] * 3);
        const offset = edgeVertices.length / 3;
        edgeVertices.push(...a.toArray(), ...b.toArray(), a.x, a.y - .055, a.z, b.x, b.y - .055, b.z);
        edgeUV.push(0, 1, a.distanceTo(b), 1, 0, 0, a.distanceTo(b), 0);
        edgeIndices.push(offset, offset + 2, offset + 1, offset + 1, offset + 2, offset + 3);
      }
      const fascia = new THREE.BufferGeometry();
      fascia.setAttribute('position', new THREE.Float32BufferAttribute(edgeVertices, 3));
      fascia.setAttribute('uv', new THREE.Float32BufferAttribute(edgeUV, 2));
      fascia.setIndex(edgeIndices); fascia.computeVertexNormals(); mesh(fascia, mats.darkWood).name = '望板封边';
      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < ridgeCount; column++) {
          createTile(sector, row, (column + .5) / ridgeCount, true);
          if (column > 0) createTile(sector, row, column / ridgeCount, false);
        }
      }
      for (let column = 1; column < ridgeCount; column++) {
        const end = position(sector, 1, column / ridgeCount);
        const radius = outer / ridgeCount * .29;
        const face = cylinder(radius, radius, .024, ...end.toArray(), mats.tileLight, 16);
        const facing = end.clone().sub(position(sector, .995, column / ridgeCount)).normalize();
        face.quaternion.setFromUnitVectors(v(0, 1, 0), facing);
        const seal = mesh(new THREE.TorusGeometry(radius * .64, .005, 4, 12), mats.tileDark, end.clone().addScaledVector(facing, .014));
        seal.quaternion.setFromUnitVectors(v(0, 0, 1), facing);
      }
      const edge = Array.from({ length: 25 }, (_, j) => position(sector, 1, j / 24).add(v(0, -.055, 0)));
      tube(edge, .09, mats.darkWood, pavilion, 30, 8);
      tube(edge.map(p => p.clone().add(v(0, -.075, 0))), .027, mats.darkWood, pavilion, 30, 6);
      const hip = Array.from({ length: 24 }, (_, j) => position(sector, j / 23, 0).add(v(0, .055, 0)));
      tube(hip, .068, mats.tileLight, pavilion, 30, 8);
      const tip = position(sector, 1, 0), radial = v(Math.cos(sector * TAU / 6), 0, Math.sin(sector * TAU / 6));
      tube([tip.clone().add(v(0, .04, 0)), tip.clone().addScaledVector(radial, .065).add(v(0, .065, 0)), tip.clone().addScaledVector(radial, .105).add(v(0, .13, 0))], .058, mats.tileLight, pavilion, 12, 8);
      for (let j = 1; j < 12; j++) {
        const end = position(sector, .975, j / 12).add(v(0, -.14, 0));
        const start = position(sector, .65, j / 12).add(v(0, -.15, 0));
        beam(start, end, .045, .065, mats.wood);
      }
      for (const t of [.20, .40, .63, .83]) {
        tube(Array.from({ length: 9 }, (_, j) => position(sector, t, j / 8).add(v(0, -.21, 0))), .065, mats.darkWood, pavilion, 12, 8);
      }
      for (let j = 1; j < 17; j++) {
        tube(Array.from({ length: 10 }, (_, k) => position(sector, .05 + k / 9 * .92, j / 17).add(v(0, -.12, 0))), .035, mats.wood, pavilion, 18, 6);
      }
    }
    for (const [matrices, colors, pan] of [[capMatrices, capColors, false], [panMatrices, panColors, true]]) {
      const tiles = new THREE.InstancedMesh(clayTileGeometry(pan), pan ? mats.tile : mats.tileLight, matrices.length);
      tiles.name = `${outer > 3 ? '下檐' : '上檐'}·${pan ? '逐片板瓦' : '逐片筒瓦'}`;
      matrices.forEach((matrix, i) => { tiles.setMatrixAt(i, matrix); tiles.setColorAt(i, colors[i]); });
      tiles.castShadow = true; tiles.receiveShadow = true; pavilion.add(tiles);
      detailCounts.roofTiles += matrices.length;
    }
  }
  buildRoof(1.0, 4.66, 4.48, 1.94, 27);
  cylinder(1.21, 1.36, .48, 0, 6.22, 0, mats.wood, 6).rotation.y = Math.PI / 6;
  buildRoof(.07, 2.49, 6.12, 1.81, 17);
  for (const [r, h, y] of [[.18, .10, 7.95], [.12, .16, 8.07], [.16, .07, 8.17]]) cylinder(r, r * 1.05, h, 0, y, 0, mats.tileLight);
  mesh(new THREE.SphereGeometry(.09, 16, 12), mats.tileLight, v(0, 8.27, 0));
  cylinder(0, .045, .12, 0, 8.37, 0, mats.tileLight);

  const plaque = box(1.62, .53, .08, 0, 3.95, 2.81, mats.darkWood);
  plaque.name = '长衣亭匾额';
  const plaqueFace = mesh(new THREE.PlaneGeometry(1.55, .48), new THREE.MeshStandardMaterial({ name: '匾额', map: plaqueMap || plaqueTexture(), roughness: .65 }), v(0, 3.95, 2.855));
  plaqueFace.name = '长衣亭题字';
  for (const x of [-.62, .62]) box(.025, .15, .035, x, 4.25, 2.8, mats.brass);

  const clothMaterial = new THREE.MeshPhysicalMaterial({ name: '轻纱', color: '#ecebda', side: THREE.DoubleSide, transparent: true, opacity: .79, roughness: 1, sheen: .7, sheenColor: new THREE.Color('#fff4e4'), depthWrite: false });
  clothMaterial.forceSinglePass = true;
  clothMaterial.onBeforeCompile = shader => {
    shader.uniforms.uClothTime = clothTime;
    shader.vertexShader = `uniform float uClothTime;
      attribute float clothPhase;
      vec2 clothWave(float y) {
        float weight = (1.295 - y) / 2.59;
        float phase = y * 2.0 + uClothTime * .72 + clothPhase;
        float wave = sin(phase) * .08 + sin(uClothTime * .44 + clothPhase) * .035;
        return vec2(wave * weight, cos(phase) * .16 * weight - wave / 2.59);
      }\n` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
      objectNormal.y -= objectNormal.z * clothWave(position.y).y;
      objectNormal = normalize(objectNormal);`);
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      transformed.z += clothWave(position.y).x;`);
  };
  clothMaterial.customProgramCacheKey = () => 'pavilion-cloth-v1';
  for (const index of [0, 2, 3]) {
    const p = corners[index], q = corners[(index + 1) % 6];
    const center = p.clone().lerp(q, .5).multiplyScalar(.98);
    for (const sign of [-1, 1]) {
      const group = new THREE.Group(); group.userData.dynamic = true;
      group.position.set(center.x, 0, center.z);
      group.rotation.y = -Math.atan2(q.z - p.z, q.x - p.x);
      pavilion.add(group);
      const geo = new THREE.PlaneGeometry(.76, 2.59, 16, 24);
      const pos = geo.attributes.position;
      for (let j = 0; j < pos.count; j++) {
        const x = pos.getX(j), y = pos.getY(j), normalized = (y + 1.295) / 2.59;
        pos.setX(j, x * (.68 + .32 * Math.abs(normalized - .4) * 1.8));
        pos.setZ(j, Math.sin(x * 32) * .055 + Math.sin(y * 1.2) * .06);
      }
      geo.computeVertexNormals();
      geo.setAttribute('clothPhase', new THREE.Float32BufferAttribute(new Float32Array(pos.count).fill(index + sign), 1));
      geo.computeBoundingBox(); geo.boundingBox.expandByVector(v(0, 0, .115));
      geo.boundingSphere = geo.boundingBox.getBoundingSphere(new THREE.Sphere());
      const cloth = mesh(geo, clothMaterial, v(sign * 1.02, 2.77, 0), group);
      cloth.castShadow = false;
      cloth.userData.deforming = true;
      const tie = mesh(new THREE.TorusGeometry(.1, .015, 6, 20), mats.brass, v(sign * 1.02, 2.48, .035), group);
      tie.rotation.y = Math.PI / 2;
    }
  }

  for (const index of [0, 1, 2, 4]) {
    const a = corners[index].clone().lerp(corners[(index + 1) % 6], .5).multiplyScalar(1.04);
    if (index === 1) a.x = -1.02;
    const group = new THREE.Group(); group.name = '悬灯'; group.position.set(a.x, 4.12, a.z); group.userData.dynamic = true; pavilion.add(group);
    cylinder(.015, .015, .26, 0, -.16, 0, mats.brass, 8, group);
    const lamp = mesh(new THREE.SphereGeometry(.21, 24, 16), mats.lantern, v(0, -.53, 0), group); lamp.scale.set(1, 1.36, 1);
    for (let j = 0; j < 8; j++) {
      const a = j * TAU / 8;
      const pts = Array.from({ length: 13 }, (_, k) => {
        const t = .15 + k / 12 * (Math.PI - .3);
        return v(Math.cos(a) * Math.sin(t) * .213, -.53 + Math.cos(t) * .29, Math.sin(a) * Math.sin(t) * .213);
      });
      tube(pts, .008, mats.brass, group, 14, 4);
    }
    for (const y of [-.81, -.25]) cylinder(.083, .083, .055, 0, y, 0, mats.brass, 12, group);
    for (let j = 0; j < 5; j++) beam(v((j - 2) * .008, -.85, 0), v((j - 2) * .012, -1.03, .015), .006, .006, mats.wood, group);
    lanterns.push(group); lightPositions.push(v(a.x, 3.59, a.z));
  }

  const islandGeo = new THREE.CylinderGeometry(6.22, 6.8, .55, 64);
  const ip = islandGeo.attributes.position;
  for (let i = 0; i < ip.count; i++) {
    const x = ip.getX(i), z = ip.getZ(i), a = Math.atan2(z, x);
    const noise = 1 + Math.sin(a * 7) * .025 + Math.sin(a * 13 + .7) * .012;
    ip.setX(i, x * noise); ip.setZ(i, z * noise * .89);
  }
  islandGeo.computeVertexNormals(); mesh(meadowUV(islandGeo), mats.soil, v(0, -.32, 0), garden);

  for (let i = 0; i < 47; i++) {
    const a = i / 47 * TAU;
    if (a > .99 && a < 2.13) continue;
    const r = 6.1 + random() * .28;
    const rock = mesh(rockGeometry(.34 + random() * .24), i % 3 ? mats.stoneDark : mats.stone, v(Math.cos(a) * r, -.13 + random() * .1, Math.sin(a) * r * .88), garden);
    rock.scale.set(1.35, .6 + random() * .5, .9); rock.rotation.set(random(), random() * 4, random());
  }

  for (let i = 0; i < 24; i++) {
    const t = (i + .5) / 24, z = 5.0 + t * 6.5;
    const slab = box(1.83, .18, .265, 0, bridgeHeight(t), z, mats.stone, garden);
    slab.rotation.x = -Math.atan(Math.cos(t * Math.PI) * .46 * Math.PI / 6.5);
  }
  for (const sign of [-1, 1]) {
    const x = sign * .94;
    for (let i = 0; i <= 10; i++) {
      const t = i / 10, z = 5 + t * 6.5;
      box(.10, .73, .10, x, bridgeHeight(t) + .34, z, mats.stone, garden);
      cylinder(.085, .075, .09, x, bridgeHeight(t) + .745, z, mats.stone, 8, garden);
    }
    for (const height of [.36, .68]) tube(Array.from({ length: 25 }, (_, i) => v(x, bridgeHeight(i / 24) + height, 5 + i / 24 * 6.5)), .047, mats.stone, garden, 42, 6);
    for (let i = 0; i < 32; i++) {
      mesh(archStoneGeometry((i + .008) / 32, (i + .992) / 32), i % 5 === 0 ? mats.stoneDark : mats.stone, v(sign * .79, 0, 0), garden).name = '石桥·顺拱楔形券石';
    }
    for (const z of [5.05, 11.45]) box(.43, .73, .7, sign * .75, -.35, z, mats.stoneDark, garden);
  }

  // The bridge lands on a continuous bank, with a curved path through a moon gate.
  const shoreCenter = v(2, -.03, 23), shoreRX = 13, shoreRZ = 12.5;
  function shoreEdge(a, scale = 1) {
    const irregular = 1 + Math.sin(a * 5 + .4) * .025 + Math.sin(a * 11) * .018;
    return v(shoreCenter.x + Math.cos(a) * shoreRX * scale * irregular, shoreCenter.y, shoreCenter.z + Math.sin(a) * shoreRZ * scale * irregular);
  }
  const shoreShape = new THREE.Shape();
  for (let i = 0; i <= 120; i++) {
    const p = shoreEdge(i / 120 * TAU);
    if (i === 0) shoreShape.moveTo(p.x, -p.z); else shoreShape.lineTo(p.x, -p.z);
  }
  const shoreGeo = new THREE.ExtrudeGeometry(shoreShape, { depth: .65, bevelEnabled: true, bevelThickness: .17, bevelSize: .3, bevelSegments: 2, steps: 1 });
  shoreGeo.rotateX(-Math.PI / 2); mesh(meadowUV(shoreGeo), mats.soil, v(0, -.89, 0), garden);
  const path = new THREE.CatmullRomCurve3([v(0, .01, 11.05), v(.65, .025, 12.65), v(2.7, .03, 14.8), v(4.7, .03, 16.3), v(6.4, .03, 19.6), v(7.3, .03, 24.4), v(8.5, .03, 31)]);
  for (let i = 0; i < 63; i++) {
    const t = i / 62, p = path.getPointAt(t), tangent = path.getTangentAt(t);
    const across = v(tangent.z, 0, -tangent.x).normalize();
    for (let j = 0; j < 3; j++) {
      const pos = p.clone().addScaledVector(across, (j - 1) * .5);
      const slab = box(.49, .09, .33, ...pos.toArray(), (i + j) % 7 === 0 ? mats.stoneDark : mats.stone, garden);
      slab.rotation.y = Math.atan2(tangent.x, tangent.z) + (random() - .5) * .035;
    }
    for (const sign of [-1, 1]) {
      const pos = p.clone().addScaledVector(across, sign * .84);
      const curb = box(.095, .12, .335, ...pos.toArray(), mats.stoneDark, garden);
      curb.rotation.y = Math.atan2(tangent.x, tangent.z);
    }
  }
  for (let i = 0; i < 93; i++) {
    const a = i / 93 * TAU, p = shoreEdge(a);
    if (p.z < 12 && Math.abs(p.x) < 1.35) continue;
    const rock = mesh(rockGeometry(.28 + random() * .28), i % 4 ? mats.stoneDark : mats.stone, p.add(v(0, -.13, 0)), garden);
    rock.scale.set(1.5, .55 + random() * .55, .8); rock.rotation.set(random(), random() * TAU, random());
  }
  const gate = new THREE.Group(); gate.name = '月洞门·桥头入园'; gate.position.set(4.7, .01, 16.3); gate.rotation.y = .57; garden.add(gate);
  const plaster = new THREE.MeshStandardMaterial({ color: '#d6d6c8', map: stoneMap, bumpMap: stoneMap, bumpScale: .025, roughness: .97 });
  const gateShape = new THREE.Shape(); gateShape.moveTo(-2.35, 0); gateShape.lineTo(2.35, 0); gateShape.lineTo(2.35, 3.34); gateShape.lineTo(-2.35, 3.34); gateShape.closePath();
  const opening = new THREE.Path(); opening.absarc(0, 1.41, 1.37, 0, TAU, true); gateShape.holes.push(opening);
  mesh(new THREE.ExtrudeGeometry(gateShape, { depth: .38, bevelEnabled: true, bevelSize: .025, bevelThickness: .025, bevelSegments: 2, curveSegments: 64, steps: 1 }), plaster, v(0, 0, -.19), gate);
  for (const z of [-.218, .218]) mesh(new THREE.TorusGeometry(1.385, .048, 6, 96), mats.stoneDark, v(0, 1.41, z), gate);
  for (const x of [-1.93, 1.93]) {
    box(.85, .25, .45, x, .125, 0, mats.stoneDark, gate);
    for (let j = 0; j < 3; j++) box(.8, .014, .012, x, .4 + j * .24, .203, mats.stoneDark, gate);
  }
  for (const sign of [-1, 1]) {
    const cap = box(5.06, .09, .49, 0, 3.37, sign * .19, mats.tileDark, gate); cap.rotation.x = sign * .23;
    for (let i = 0; i < 38; i++) {
      const tile = mesh(clayTileGeometry(false), mats.tileLight, v((i - 18.5) * .13, 3.41, sign * .23), gate);
      tile.scale.set(.13, .13, .55); tile.rotation.x = sign * .23; detailCounts.roofTiles++;
    }
  }
  tube([v(-2.51, 3.48, 0), v(0, 3.5, 0), v(2.51, 3.48, 0)], .065, mats.tileLight, gate, 20, 8);
  for (const [x, z] of [[-1.48, 11.8], [1.51, 11.8]]) {
    box(.42, .15, .42, x, .1, z, mats.stoneDark, garden);
    box(.24, .52, .24, x, .4, z, mats.stone, garden);
    box(.34, .06, .34, x, .69, z, mats.stoneDark, garden);
    box(.21, .22, .21, x, .81, z, mats.lantern, garden);
    for (const dx of [-.13, .13]) for (const dz of [-.13, .13]) box(.04, .24, .04, x + dx, .82, z + dz, mats.stone, garden);
    cylinder(0, .31, .20, x, 1.04, z, mats.stoneDark, 4, garden).rotation.y = Math.PI / 4;
    lightPositions.push(v(x, .83, z));
  }

  // Two places at a tea table give the otherwise empty pavilion a human scale.
  cylinder(.65, .67, .09, -.65, 1.39, -.7, mats.darkWood, 48);
  cylinder(.09, .17, .69, -.65, 1.02, -.7, mats.wood, 16);
  for (const z of [-1.65, .25]) { cylinder(.28, .30, .08, -.65, 1.10, z, mats.darkWood, 32); for (const dx of [-.16, .16]) box(.06, .43, .17, -.65 + dx, .86, z, mats.wood); }
  const porcelain = new THREE.MeshPhysicalMaterial({ color: '#d1ded1', roughness: .2, clearcoat: .7 });
  for (const z of [-1.02, -.39]) {
    cylinder(.12, .07, .035, -.65, 1.46, z, porcelain, 24);
    const cupShape = [new THREE.Vector2(.055, 0), new THREE.Vector2(.077, .025), new THREE.Vector2(.091, .087), new THREE.Vector2(.078, .087), new THREE.Vector2(.064, .025), new THREE.Vector2(.035, .016)];
    mesh(new THREE.LatheGeometry(cupShape, 24), porcelain, v(-.65, 1.48, z));
  }

  const blossomGeo = peachBlossomGeometry();
  const blossomMat = new THREE.MeshStandardMaterial({ name: '桃花', color: '#f3cad0', vertexColors: true, roughness: .82, side: THREE.DoubleSide });
  const leafMap = peachLeafTexture();
  const peachLeafMat = new THREE.MeshPhysicalMaterial({ map: leafMap, bumpMap: leafMap, bumpScale: .003, roughness: .59, side: THREE.DoubleSide, sheen: .35, sheenColor: new THREE.Color('#b9cf79') });
  const leafMatrices = [], flowerMatrices = [], leafColors = [], flowerColors = [], dummy = new THREE.Object3D();
  function peachTree(base, scale, rotation) {
    const tree = new THREE.Group(); tree.name = '桃树·枝叶与花'; tree.userData.batchRegion = true; tree.position.copy(base); tree.scale.setScalar(scale); tree.rotation.y = rotation; garden.add(tree);
    tree.updateMatrixWorld(true);
    const addBranch = (points, r0, r1, segments = 12) => { detailCounts.branches++; mesh(taperedBranchGeometry(points, r0, r1, segments), mats.bark, null, tree); return new THREE.CatmullRomCurve3(points); };
    const trunk = addBranch([v(0, 0, 0), v(.19, .8, -.05), v(.09, 1.8, .08), v(-.19, 2.7, .07), v(-.47, 3.7, .1), v(-.62, 4.6, -.09)], .245, .025, 28);
    for (let r = 0; r < 6; r++) { const a = r * TAU / 6; addBranch([v(Math.cos(a) * .75, -.02, Math.sin(a) * .75), v(Math.cos(a) * .31, .10, Math.sin(a) * .31), v(.02, .35, 0)], .015, .105, 9); }
    for (let i = 0; i < 11; i++) {
      const a = i * 2.39996 + .3, start = trunk.getPoint(.29 + i / 11 * .46);
      const spread = 2.05 - i / 11 * .6 + random() * .45;
      const tip = v(Math.cos(a) * spread - .28, 3.1 + i / 11 * 1.75 + random() * .3, Math.sin(a) * spread);
      const primary = addBranch([start, start.clone().lerp(tip, .5).add(v(.08, -.24, .05)), tip], .11 - i * .0045, .012, 17);
      for (let j = 0; j < 6; j++) {
        const begin = primary.getPoint(.30 + j * .12), sideAngle = a + (j % 2 ? -1 : 1) * (.65 + random() * .65);
        const end = begin.clone().add(v(Math.cos(sideAngle) * (.64 + random() * .35), .30 + random() * .6, Math.sin(sideAngle) * (.64 + random() * .4)));
        const secondary = addBranch([begin, begin.clone().lerp(end, .5).add(v(0, -.08, 0)), end], .026, .004, 10);
        for (let k = 0; k < 4; k++) {
          const origin = secondary.getPoint(.25 + k * .23), az = sideAngle + (k % 2 ? 1 : -1) * (.7 + random() * .5);
          const finish = origin.clone().add(v(Math.cos(az) * (.35 + random() * .28), .16 + random() * .38, Math.sin(az) * (.35 + random() * .28)));
          const twig = addBranch([origin, origin.clone().lerp(finish, .55).add(v(0, .045, 0)), finish], .008, .0015, 6);
          for (let n = 1; n <= 6; n++) {
            const node = twig.getPoint(n / 7), angle = az + n * 2.39996;
            const direction = v(Math.cos(angle) * .8, .30 + random() * .65, Math.sin(angle) * .8).normalize();
            dummy.position.copy(node); dummy.quaternion.setFromUnitVectors(v(0, 1, 0), direction); dummy.rotateY(random() * TAU);
            dummy.scale.setScalar(.72 + random() * .65); dummy.updateMatrix();
            leafMatrices.push(tree.matrixWorld.clone().multiply(dummy.matrix));
            leafColors.push(new THREE.Color().setHSL(.23 + random() * .07, .22 + random() * .25, .69 + random() * .2));
            if (random() < .48) {
              dummy.position.copy(node).addScaledVector(direction, .025); dummy.rotation.set(random() * TAU, random() * TAU, random() * TAU); dummy.scale.setScalar(.72 + random() * .55); dummy.updateMatrix();
              flowerMatrices.push(tree.matrixWorld.clone().multiply(dummy.matrix));
              flowerColors.push(new THREE.Color().setHSL(.96 + random() * .035, .18 + random() * .25, .76 + random() * .19));
            }
          }
        }
      }
    }
  }
  peachTree(v(-5.05, -.04, -1.2), 1.05, .6);
  peachTree(v(4.8, -.04, -2.25), .75, 2.1);
  peachTree(v(-3.0, -.01, 14.5), .8, 1.1);
  for (const [geometry, material, matrices, colors, name] of [[peachLeafGeometry(), peachLeafMat, leafMatrices, leafColors, '桃叶·叶脉与卷曲'], [blossomGeo, blossomMat, flowerMatrices, flowerColors, '五瓣桃花·逐枝着生']]) {
    const instances = new THREE.InstancedMesh(geometry, material, matrices.length); instances.name = name;
    matrices.forEach((m, i) => { instances.setMatrixAt(i, m); instances.setColorAt(i, colors[i]); });
    instances.castShadow = true; instances.receiveShadow = true; garden.add(instances);
  }
  const centers = new THREE.InstancedMesh(new THREE.SphereGeometry(.011, 6, 4), new THREE.MeshStandardMaterial({ color: '#bf8763', roughness: .8 }), flowerMatrices.length);
  centers.name = '桃花花心'; flowerMatrices.forEach((m, i) => centers.setMatrixAt(i, m.clone().multiply(new THREE.Matrix4().makeTranslation(0, .014, 0)))); garden.add(centers);
  detailCounts.leaves = leafMatrices.length; detailCounts.blossoms = flowerMatrices.length;

  // Short meadow cover and taller damp-bank tufts share geometry, but not a uniform distribution.
  const grassGeo = grassClumpGeometry(), grassTime = { value: 0 };
  grassGeo.computeBoundingBox(); grassGeo.boundingBox.expandByVector(v(.026, 0, .013));
  grassGeo.boundingSphere = grassGeo.boundingBox.getBoundingSphere(new THREE.Sphere());
  const grassMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: .92, side: THREE.DoubleSide });
  grassMaterial.onBeforeCompile = shader => {
    shader.uniforms.uGrassTime = grassTime;
    shader.vertexShader = 'uniform float uGrassTime;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec3 rootWorld = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      float weight = pow(clamp(position.y / 0.34, 0.0, 1.0), 2.0);
      float breeze = sin(uGrassTime * 1.15 + rootWorld.x * 0.72 + rootWorld.z * 0.58);
      transformed.x += breeze * weight * 0.026;
      transformed.z += sin(uGrassTime * 0.83 + rootWorld.z * 0.65) * weight * 0.013;`);
  };
  grassMaterial.customProgramCacheKey = () => 'pavilion-grass-v1';
  const pathPoints = path.getSpacedPoints(130);
  function pathDistance(x, z) {
    let distanceSquared = Infinity;
    for (let i = 0; i < pathPoints.length - 1; i++) {
      const a = pathPoints[i], b = pathPoints[i + 1], dx = b.x - a.x, dz = b.z - a.z;
      const t = THREE.MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
      distanceSquared = Math.min(distanceSquared, (x - a.x - dx * t) ** 2 + (z - a.z - dz * t) ** 2);
    }
    return Math.sqrt(distanceSquared);
  }
  const grassPatches = new Map();
  const grassCounts = { island: 0, arrival: 0, blades: 0, minimumPathClearance: Infinity };
  for (let i = 0; i < 84000; i++) {
    const island = i < 15000, angle = random() * TAU, radius = Math.sqrt(random());
    const x = island ? Math.cos(angle) * radius * 6.03 : shoreCenter.x + Math.cos(angle) * radius * 12.85;
    const z = island ? Math.sin(angle) * radius * 5.35 : shoreCenter.z + Math.sin(angle) * radius * 12.3;
    let edgeDistance, walkDistance;
    if (island) {
      const hexDistance = Math.max(Math.abs(x * .866 + z * .5), Math.abs(z), Math.abs(x * .866 - z * .5));
      if (hexDistance < 3.75 || (Math.abs(x) < 1.42 && z > 2.9)) continue;
      edgeDistance = 6.03 - Math.hypot(x, z / .89); walkDistance = hexDistance - 3.61;
      if (Math.hypot(x + 5.05, z + 1.2) < .29 || Math.hypot(x - 4.8, z + 2.25) < .22) continue;
    } else {
      const edge = shoreEdge(angle), shoreRadius = Math.hypot((edge.x - shoreCenter.x) / shoreRX, (edge.z - shoreCenter.z) / shoreRZ);
      const r = Math.hypot((x - shoreCenter.x) / shoreRX, (z - shoreCenter.z) / shoreRZ);
      edgeDistance = (shoreRadius - r) * 12;
      if (edgeDistance < .12) continue;
      walkDistance = pathDistance(x, z);
      if (walkDistance < 1.04) continue;
      const gx = (x - 4.7) * Math.cos(.57) - (z - 16.3) * Math.sin(.57), gz = (x - 4.7) * Math.sin(.57) + (z - 16.3) * Math.cos(.57);
      if (Math.abs(gx) < 2.51 && Math.abs(gz) < .40) continue;
      if (Math.hypot(x + 3, z - 14.5) < .28) continue;
      if ([-1.48, 1.51].some(lx => Math.hypot(x - lx, z - 11.8) < .34)) continue;
    }
    const patch = meadowNoise(x * .6 + 4, z * .6), dry = meadowNoise(x * .33, z * .33 + 5);
    if (random() > .70 + patch * .29) continue;
    let height = (.34 + random() * .43) * (.75 + patch * .55);
    if (edgeDistance < .50) height *= 1.55;
    if (walkDistance < 1.4) height *= .65;
    const spread = .77 + random() * .78;
    dummy.position.set(x, island ? -.044 : -.069, z); dummy.rotation.set((random() - .5) * .12, random() * TAU, (random() - .5) * .12);
    dummy.scale.set(spread, height, spread); dummy.updateMatrix();
    const color = dry > .65 && random() > .55 ? new THREE.Color().setRGB(1.23, 1.06, .74) : new THREE.Color().setRGB(.79 + random() * .38, .83 + random() * .30, .78 + random() * .34);
    const key = `${Math.floor(x / 5)},${Math.floor(z / 5)}`;
    if (!grassPatches.has(key)) grassPatches.set(key, []);
    grassPatches.get(key).push({ matrix: dummy.matrix.clone(), color });
    grassCounts[island ? 'island' : 'arrival']++; grassCounts.blades += 6;
    if (!island) grassCounts.minimumPathClearance = Math.min(grassCounts.minimumPathClearance, walkDistance);
  }
  for (const [key, instances] of grassPatches) {
    const grass = new THREE.InstancedMesh(grassGeo, grassMaterial, instances.length); grass.name = `草坪·${key}`;
    instances.forEach(({matrix, color}, i) => { grass.setMatrixAt(i, matrix); grass.setColorAt(i, color); });
    grass.receiveShadow = true; grass.computeBoundingSphere(); garden.add(grass);
  }
  detailCounts.grass = grassCounts;
  root.userData.detailCounts = detailCounts;

  batchModel(root);
  root.userData.geometryMetrics = modelMetrics(root);
  root.userData.design = { type: 'original-artistic-pavilion', units: 'metres', roofDeckThickness: .055, pavingRadius: 3.74, revision: 2 };

  return {
    root, lanternMaterial: mats.lantern, lightPositions,
    update(time) {
      grassTime.value = time;
      clothTime.value = time;
      lanterns.forEach((lamp, i) => {
        lamp.rotation.z = Math.sin(time * .63 + i) * .018;
        lamp.updateMatrixWorld(true);
        lightPositions[i].set(0, -.53, 0).applyMatrix4(lamp.matrixWorld);
      });
    },
  };
}
