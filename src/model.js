import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { clayTileGeometry, taperedBranchGeometry, peachLeafGeometry, peachLeafTexture, peachBlossomGeometry, meadowNoise, meadowTexture, grassClumpGeometry } from './detail-geometry.js';
import { clipToHexagon, pavingStoneGeometry, columnBaseGeometry, timberColumnGeometry, bracketArmGeometry, bridgeHeight, archStoneGeometry, hexRingGeometry, joinedLatticeGeometry, dressedPathSlabGeometry as pathSlabGeometry, beveledBoxGeometry } from './architecture-geometry.js';
import { roofPoint, roofTileSectors, tileElevation, ROOF_COLOR_SCALE } from './roof-geometry.js';
import { CLOTH_HEIGHT, CLOTH_TIE_Y, clothProfile, clothWave, clothShader } from './cloth.js';
import { standardizeSurfaceMaterials } from './materials.js';
import { createArchitecturalSurfaces } from './surface-materials.js';
import { finishSurfaces, timberUV, detailRandom } from './surface-finishing.js';
import { addPavilionCraft } from './pavilion-craft.js';
import { batchModel, modelMetrics } from './model-optimization.js';

const TAU = Math.PI * 2;
let seed = 48;
const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const v = (x, y, z) => new THREE.Vector3(x, y, z);

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

export function buildPavilion({ plaqueMap, surfaceImages } = {}) {
  // Seed 48 after the legacy three 512² texture fields. Texture changes now leave
  // every established tile, tree, blossom and grass placement untouched.
  seed = 1622933552;
  const root = new THREE.Group(); root.name = '长衣亭 · 予张依婷';
  const pavilion = new THREE.Group(); pavilion.name = '六角重檐亭'; root.add(pavilion);
  const garden = new THREE.Group(); garden.name = '临水桃花庭'; root.add(garden);
  const surfaces = createArchitecturalSurfaces(surfaceImages);
  const meadowMap = meadowTexture();
  const mats = {
    wood: new THREE.MeshStandardMaterial({ color: '#96604b', ...surfaces.wood, normalScale: new THREE.Vector2(.58, .58), roughness: 1 }),
    darkWood: new THREE.MeshStandardMaterial({ color: '#5b4435', ...surfaces.wood, normalScale: new THREE.Vector2(.48, .48), roughness: 1 }),
    stone: new THREE.MeshStandardMaterial({ color: '#c4c5b9', ...surfaces.stone, normalScale: new THREE.Vector2(.74, .74), roughness: 1 }),
    stoneDark: new THREE.MeshStandardMaterial({ color: '#838f82', ...surfaces.stone, normalScale: new THREE.Vector2(.60, .60), roughness: 1 }),
    tile: new THREE.MeshStandardMaterial({ color: '#515959', ...surfaces.tile, normalScale: new THREE.Vector2(.62, .62), roughness: 1 }),
    tileLight: new THREE.MeshStandardMaterial({ color: '#687273', ...surfaces.tile, normalScale: new THREE.Vector2(.55, .55), roughness: 1 }),
    tileDark: new THREE.MeshStandardMaterial({ color: '#353b37', roughness: .8 }),
    brass: new THREE.MeshStandardMaterial({ color: '#9e895b', roughness: .58, metalness: .72 }),
    soil: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, map: meadowMap, bumpMap: meadowMap, bumpScale: .025 }),
    bark: new THREE.MeshStandardMaterial({ color: '#8b8073', ...surfaces.bark, normalScale: new THREE.Vector2(.82, .82), roughness: 1 }),
    leaf: new THREE.MeshStandardMaterial({ color: '#71886b', roughness: .85, side: THREE.DoubleSide }),
    lantern: new THREE.MeshStandardMaterial({ color: '#eedcaf', ...surfaces.paper, roughness: .92, emissive: '#ffbf70', emissiveMap: surfaces.paper.map, emissiveIntensity: .25 }),
  };
  for (const [name, material] of Object.entries(mats)) material.name = name;
  const endgrain = new THREE.MeshStandardMaterial({ name: '木端面', color: '#956f51', ...surfaces.endgrain, normalScale: new THREE.Vector2(.40, .40), roughness: 1 });
  const lanterns = [], lightPositions = [], curtainTies = [], clothTime = { value: 0 };
  const detailCounts = { roofTiles: 0, ridgeCaps: 0, branches: 0, leaves: 0, blossoms: 0, pavingStones: 0 };

  function mesh(geometry, material, pos, parent = pavilion) {
    const m = new THREE.Mesh(geometry, material);
    if (pos) m.position.copy(pos);
    m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }
  function box(w, h, d, x, y, z, material = mats.wood, parent = pavilion) {
    const stone = material === mats.stone || material === mats.stoneDark;
    const timber = material === mats.wood || material === mats.darkWood;
    const bevel = (stone || timber) && Math.min(w, h, d) >= .075 ? (stone ? .006 : .003) : 0;
    const geometry = bevel ? beveledBoxGeometry(w, h, d, bevel) : new THREE.BoxGeometry(w, h, d);
    if (timber) timberUV(geometry, h >= w && h >= d ? 'y' : d >= w ? 'z' : 'x');
    if (stone) {
      const { position, normal, uv } = geometry.attributes;
      for (let i = 0; i < position.count; i++) {
        const nx = Math.abs(normal.getX(i)), ny = Math.abs(normal.getY(i)), nz = Math.abs(normal.getZ(i));
        if (ny >= nx && ny >= nz) uv.setXY(i, (position.getX(i) + x) * 1.3, (position.getZ(i) + z) * 1.3);
        else uv.setXY(i, (nx > nz ? position.getZ(i) + z : position.getX(i) + x) * 1.3, (position.getY(i) + y) * 1.3);
      }
    }
    return mesh(geometry, material, v(x, y, z), parent);
  }
  function cylinder(rt, rb, h, x, y, z, material, segments = 24, parent = pavilion) {
    const geometry = new THREE.CylinderGeometry(rt, rb, h, segments);
    if (material === mats.wood || material === mats.darkWood) {
      const { position, normal, uv } = geometry.attributes;
      const repeats = Math.max(1, Math.round((rt + rb) * Math.PI / .22));
      for (let i = 0; i < position.count; i++) {
        if (Math.abs(normal.getY(i)) > .9) uv.setXY(i, position.getX(i) / .22, position.getZ(i) / 2);
        else uv.setXY(i, uv.getX(i) * repeats, position.getY(i) / 2);
      }
    }
    if (material === mats.stone || material === mats.stoneDark) {
      const { position, normal, uv } = geometry.attributes, repeats = Math.max(1, Math.round((rt + rb) / 2 * TAU * 1.3));
      for (let i = 0; i < position.count; i++) {
        if (Math.abs(normal.getY(i)) > .9) uv.setXY(i, (position.getX(i) + x) * 1.3, (position.getZ(i) + z) * 1.3);
        else uv.setXY(i, uv.getX(i) * repeats, (position.getY(i) + y) * 1.3);
      }
    }
    return mesh(geometry, material, v(x, y, z), parent);
  }
  function beam(a, b, width, height, material = mats.wood, parent = pavilion) {
    const m = box(width, height, a.distanceTo(b), ...a.clone().add(b).multiplyScalar(.5).toArray(), material, parent);
    if (material === mats.wood || material === mats.darkWood) {
      const { position, normal, uv } = m.geometry.attributes;
      for (let i = 0; i < position.count; i++) {
        const nx = Math.abs(normal.getX(i)), ny = Math.abs(normal.getY(i)), nz = Math.abs(normal.getZ(i));
        // Keep a physical grain scale; end faces need a 2D UV frame as well.
        if (nz >= nx && nz >= ny) uv.setXY(i, position.getX(i) / .22 + .5, position.getY(i) / .22 + .5);
        else uv.setXY(i, (nx > ny ? position.getY(i) : position.getX(i)) / .22 + .5, position.getZ(i) / 2 + .5);
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
  mesh(hexRingGeometry(3.14, .23, .29), mats.wood, v(0, 4.27, 0)).name = '抹角环梁';
  mesh(hexRingGeometry(3.14 * .82, .20, .21), mats.darkWood, v(0, 4.44, 0)).name = '内环梁';
  mesh(hexRingGeometry(3.14, .095, .105), mats.darkWood, v(0, 3.96, 0)).name = '额枋';
  for (let i = 0; i < 6; i++) {
    const p = corners[i], q = corners[(i + 1) % 6];
    mesh(baseGeometry, mats.stone, v(p.x, .69, p.z)).name = '柱础·鼓墩与收分';
    mesh(columnGeometry, mats.wood, v(p.x, .95, p.z)).name = '木柱·微鼓收分';
    cylinder(.186, .186, .055, p.x, 1.04, p.z, mats.brass, 24);
    cylinder(.184, .184, .08, p.x, 4.17, p.z, mats.brass, 24);
    for (const [start, end] of [[p, q], [q, p]]) {
      const direction = end.clone().sub(start).normalize();
      beam(v(start.x, 3.5, start.z), v(start.x + direction.x * .64, 4.21, start.z + direction.z * .64), .105, .13);
      const bracketShape = new THREE.Shape();
      bracketShape.moveTo(0, 0); bracketShape.lineTo(.65, 0);
      bracketShape.bezierCurveTo(.57, -.14, .32, -.15, .15, -.43); bracketShape.lineTo(0, -.43); bracketShape.closePath();
      const bracket = mesh(new THREE.ExtrudeGeometry(bracketShape, { depth: .09, bevelEnabled: true, bevelThickness: .012, bevelSize: .012, bevelSegments: 2, steps: 1 }), mats.wood, v(start.x + direction.x * .06, 4.05, start.z + direction.z * .06));
      bracket.rotation.y = -Math.atan2(direction.z, direction.x);
    }
    for (let j = 1; j < 12; j++) {
      const point = p.clone().lerp(q, j / 12);
      const fret = box(.036, .21, .045, point.x, 4.09, point.z, j % 3 === 0 ? mats.brass : mats.wood);
      fret.rotation.y = -i * TAU / 6;
    }
    const angle = i * TAU / 6;
    for (let tier = 0; tier < 3; tier++) {
      const length = .56 + tier * .22;
      const armY = 4.34 + tier * .18;
      const arm = mesh(timberUV(bracketGeometries[tier], 'x'), mats.wood, v(p.x, armY, p.z));
      arm.rotation.y = -angle;
      const cross = box(.14, .07, length * .75, p.x, armY + .087, p.z);
      cross.rotation.y = -angle;
      for (const sign of [-1, 1]) {
        const tip = v(p.x + Math.cos(angle) * sign * (length * .5 - .065), armY + .081, p.z + Math.sin(angle) * sign * (length * .5 - .065));
        box(.12, .058, .15, ...tip.toArray(), mats.darkWood).rotation.y = -angle;
      }
    }
    box(.26, .09, .26, p.x, 4.285, p.z, mats.darkWood).rotation.y = -angle;
    if (i !== 1) {
      const insetP = p.clone().lerp(q, .07), insetQ = p.clone().lerp(q, .93);
      for (const y of [1.02, 1.57]) beam(v(insetP.x, y, insetP.z), v(insetQ.x, y, insetQ.z), .105, .09);
      for (let j = 0; j <= 6; j++) {
        const r = insetP.clone().lerp(insetQ, j / 6);
        box(.066, .466, .066, r.x, 1.295, r.z);
      }
      for (let j = 0; j < 6; j++) {
        const a = insetP.clone().lerp(insetQ, (j + .1) / 6), b = insetP.clone().lerp(insetQ, (j + .9) / 6);
        const fret = mesh(joinedLatticeGeometry(a.distanceTo(b), .41), mats.darkWood, v((a.x + b.x) / 2, 1.285, (a.z + b.z) / 2));
        fret.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x); fret.name = '裁口拼接花格';
      }
      const bp = p.clone().multiplyScalar(.86), bq = q.clone().multiplyScalar(.86);
      beam(v(bp.x, 1.16, bp.z), v(bq.x, 1.16, bq.z), .38, .1, mats.darkWood);
    }
    beam(v(p.x, 4.38, p.z), v(0, 5.42, 0), .14, .16, mats.darkWood);
  }
  cylinder(.16, .16, 1.34, 0, 5.27, 0, mats.darkWood);
  for (let level = 0; level < 3; level++) {
    const r = 2.4 - level * .58, y = 4.46 + level * .34;
    mesh(hexRingGeometry(r, .13, .16), mats.darkWood, v(0, y, 0)).name = '藻井抹角环梁';
    for (let i = 0; i < 6; i++) {
      const a = i * TAU / 6, b = (i + 1) * TAU / 6;
      if (level < 2) beam(v(Math.cos(a) * r, y, Math.sin(a) * r), v(Math.cos(a) * (r - .58), y + .34, Math.sin(a) * (r - .58)), .075, .12, mats.wood);
    }
  }

  function buildRoof(inner, outer, base, height, ridgeCount) {
    const position = (s, t, u) => roofPoint(s, t, u, inner, outer, base, height);
    const rows = outer > 3 ? 21 : 14;
    const capColors = [], panColors = [];
    const averages = { cap: Array.from({ length: 6 }, () => new THREE.Vector3()), pan: Array.from({ length: 6 }, () => new THREE.Vector3()) };
    const createTile = (sector, row, u, pan) => {
      const shade = .73 + random() * .34;
      const color = new THREE.Color().setRGB(shade, shade * (.97 + random() * .05), shade * .95);
      averages[pan ? 'pan' : 'cap'][sector].add(v(color.r, color.g, color.b));
      if (sector === 0) (pan ? panColors : capColors).push(color);
    };
    for (let sector = 0; sector < 6; sector++) {
      const vertices = [], uv = [], indices = [];
      const rings = 22, columns = 24;
      for (let y = 0; y <= rings; y++) {
        for (let x = 0; x <= columns; x++) {
          vertices.push(...position(sector, y / rings, x / columns).toArray());
          const radial = inner + (outer - inner) * y / rings;
          uv.push(x / columns * radial / .22, y / rings * (outer - inner) / 2);
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
      // Only inner and outer rims need closing: sector sides are shared surfaces.
      for (let x = columns; x >= 0; x--) boundary.push(rings * (columns + 1) + x);
      const edgeVertices = [], edgeUV = [], edgeIndices = [];
      for (let i = 0; i < boundary.length; i++) {
        if (i === columns || i === boundary.length - 1) continue;
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
        const facing = end.clone().sub(position(sector, .995, column / ridgeCount)).normalize();
        const radius = outer / ridgeCount * .29;
        end.y += tileElevation(.5, 1, false, outer / ridgeCount) - radius;
        const face = cylinder(radius, radius, .024, ...end.toArray(), mats.tileLight, 16);
        face.quaternion.setFromUnitVectors(v(0, 1, 0), facing);
        const seal = mesh(new THREE.TorusGeometry(radius * .64, .005, 4, 12), mats.tileDark, end.clone().addScaledVector(facing, .014));
        seal.quaternion.setFromUnitVectors(v(0, 0, 1), facing);
      }
      const edge = Array.from({ length: 25 }, (_, j) => position(sector, 1, j / 24).add(v(0, -.11, 0)));
      tube(edge, .052, mats.darkWood, pavilion, 30, 8);
      tube(edge.map(p => p.clone().add(v(0, -.078, 0))), .025, mats.darkWood, pavilion, 30, 6);
      const hipPieces = outer > 3 ? 22 : 16;
      for (let j = 0; j < hipPieces; j++) {
        const a = position(sector, j / hipPieces, 0).add(v(0, .065, 0));
        const b = position(sector, (j + 1) / hipPieces, 0).add(v(0, .065, 0));
        const along = b.clone().sub(a).normalize(), across = v(along.z, 0, -along.x).normalize(), up = along.clone().cross(across).normalize();
        const cap = mesh(clayTileGeometry(false), mats.tileLight, a.clone().lerp(b, .5));
        cap.scale.set(.14, .13, a.distanceTo(b) * 1.035);
        cap.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(across, up, along));
        cap.name = '垂脊·分节搭接陶瓦'; detailCounts.ridgeCaps++;
      }
      const tip = position(sector, 1, 0), radial = v(Math.cos(sector * TAU / 6), 0, Math.sin(sector * TAU / 6));
      tube([tip.clone().add(v(0, .04, 0)), tip.clone().addScaledVector(radial, .065).add(v(0, .065, 0)), tip.clone().addScaledVector(radial, .105).add(v(0, .13, 0))], .058, mats.tileLight, pavilion, 12, 8);
      for (const t of [.20, .40, .63, .83]) {
        tube(Array.from({ length: 9 }, (_, j) => position(sector, t, j / 8).add(v(0, -.21, 0))), .065, mats.darkWood, pavilion, 12, 8);
      }
      for (let j = 1; j < 17; j++) {
        const rafter = Array.from({ length: 10 }, (_, k) => position(sector, .05 + k / 9 * .92, j / 17).add(v(0, -.12, 0)));
        const rafterMesh = tube(rafter, .035, mats.wood, pavilion, 18, 6);
        // TubeGeometry runs u along the timber; rotate it into the grain's v axis.
        const rafterUV = rafterMesh.geometry.attributes.uv;
        const rafterLength = new THREE.CatmullRomCurve3(rafter).getLength();
        for (let k = 0; k < rafterUV.count; k++) rafterUV.setXY(k, rafterUV.getY(k), rafterUV.getX(k) * rafterLength / 2);
        const end = rafter.at(-1), direction = end.clone().sub(rafter.at(-2)).normalize();
        const cut = mesh(new THREE.CircleGeometry(.0345, 12), endgrain, end.clone().addScaledVector(direction, .0007));
        cut.quaternion.setFromUnitVectors(v(0, 0, 1), direction); cut.name = '椽头·木材年轮端面';
      }
      // Fine joints between radial soffit boards stop inside the fascia.
      for (let j = 1; j < 13; j++) {
        tube(Array.from({ length: 8 }, (_, k) => position(sector, .045 + k / 7 * .94, j / 13).add(v(0, -.0565, 0))), .0015, mats.darkWood, pavilion, 9, 3).name = '檐下·望板拼缝';
      }
    }
    for (const pan of [false, true]) {
      const average = averages[pan ? 'pan' : 'cap'];
      const tint = average.map(sum => new THREE.Color().setRGB(sum.x / average[0].x, sum.y / average[0].y, sum.z / average[0].z));
      const material = (pan ? mats.tile : mats.tileLight).clone(); material.vertexColors = true; material.color.multiplyScalar(ROOF_COLOR_SCALE);
      const tiles = roofTileSectors({ inner, outer, base, height, rows, lanes: ridgeCount }, pan, pan ? panColors : capColors, tint, material);
      tiles.name = `${outer > 3 ? '下檐' : '上檐'}·${pan ? '曲面板瓦' : '曲面筒瓦'}`;
      pavilion.add(tiles); detailCounts.roofTiles += tiles.userData.tileCount;
    }
  }
  buildRoof(1.0, 4.66, 4.48, 1.94, 27);
  cylinder(1.21, 1.36, .48, 0, 6.22, 0, mats.wood, 6).rotation.y = Math.PI / 6;
  buildRoof(.20, 2.49, 6.12, 1.81, 17);
  for (const [r, h, y] of [[.235, .10, 7.95], [.12, .16, 8.07], [.16, .07, 8.17]]) cylinder(r, r * 1.05, h, 0, y, 0, mats.tileLight);
  mesh(new THREE.SphereGeometry(.09, 16, 12), mats.tileLight, v(0, 8.27, 0));
  cylinder(0, .045, .12, 0, 8.37, 0, mats.tileLight);

  const plaque = box(1.62, .53, .08, 0, 3.95, 2.81, mats.darkWood);
  plaque.name = '长衣亭匾额';
  const plaqueFace = mesh(new THREE.PlaneGeometry(1.55, .48), new THREE.MeshStandardMaterial({ name: '匾额', map: plaqueMap || plaqueTexture(), roughness: .65 }), v(0, 3.95, 2.855));
  plaqueFace.name = '长衣亭题字';
  for (const x of [-.62, .62]) box(.025, .15, .035, x, 4.25, 2.8, mats.brass);
  detailCounts.craft = addPavilionCraft({ mesh, box, beam, cylinder, tube, mats, endgrain, corners });

  const clothMaterial = new THREE.MeshPhysicalMaterial({ name: '轻纱', color: '#ecebda', ...surfaces.linen, normalScale: new THREE.Vector2(.3, .3), side: THREE.DoubleSide, transparent: true, opacity: .79, roughness: 1, sheen: .7, sheenColor: new THREE.Color('#fff4e4'), depthWrite: false });
  clothMaterial.forceSinglePass = true;
  clothMaterial.onBeforeCompile = shader => {
    shader.uniforms.uClothTime = clothTime;
    shader.vertexShader = clothShader + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
      objectNormal.y -= objectNormal.z * clothWave(position.y).y;
      objectNormal = normalize(objectNormal);`);
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      transformed.z += clothWave(position.y).x;`);
  };
  clothMaterial.customProgramCacheKey = () => 'pavilion-cloth-v1';
  for (const index of [0, 2, 3]) {
    const p = corners[index], q = corners[(index + 1) % 6];
    const center = p.clone().lerp(q, .5).multiplyScalar(.89);
    for (const sign of [-1, 1]) {
      const group = new THREE.Group(); group.userData.dynamic = true;
      group.position.set(center.x, 0, center.z);
      group.rotation.y = -Math.atan2(q.z - p.z, q.x - p.x);
      pavilion.add(group);
      const geo = new THREE.PlaneGeometry(.76, CLOTH_HEIGHT, 16, 24);
      const pos = geo.attributes.position;
      for (let j = 0; j < pos.count; j++) {
        const y = pos.getY(j), point = clothProfile(pos.getX(j),y);
        pos.setXYZ(j,point.x,y,point.z);
      }
      geo.computeVertexNormals();
      geo.setAttribute('clothPhase', new THREE.Float32BufferAttribute(new Float32Array(pos.count).fill(index + sign), 1));
      geo.computeBoundingBox(); geo.boundingBox.expandByVector(v(0, 0, .115));
      geo.boundingSphere = geo.boundingBox.getBoundingSphere(new THREE.Sphere());
      const cloth = mesh(geo, clothMaterial, v(sign * .93, 2.77, 0), group);
      cloth.castShadow = false;
      cloth.userData.deforming = true;
      const tie = new THREE.Group(); tie.name = `束帘系环·${index}·${sign}`;
      tie.userData.dynamic = true; tie.userData.clothTiePhase = index + sign;
      tie.position.set(sign * .93,2.77 + CLOTH_TIE_Y,clothProfile(0,CLOTH_TIE_Y).z + clothWave(CLOTH_TIE_Y,0,index + sign).offset);
      group.add(tie); curtainTies.push(tie);
      const ring = new THREE.TorusGeometry(.09,.005,4,20); ring.rotateX(Math.PI / 2); ring.scale(1,1,.36);
      mesh(ring,mats.brass,null,tie);
      mesh(new THREE.SphereGeometry(.012,8,6),mats.brass,v(.015,0,.035),tie);
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

  const bridgeCurve = new THREE.CatmullRomCurve3(Array.from({ length: 65 }, (_, i) => v(0, bridgeHeight(i / 64), 5 + i / 64 * 6.5)));
  for (let i = 0; i < 24; i++) mesh(pathSlabGeometry(bridgeCurve, (i + .01) / 24, (i + .99) / 24, -.915, .915, .18), mats.stone, null, garden).name = '石桥曲面桥板';
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
  let landingLow = 0, landingHigh = 1;
  for (let i = 0; i < 30; i++) {
    const t = (landingLow + landingHigh) / 2;
    if (path.getPointAt(t).z < 11.505) landingLow = t; else landingHigh = t;
  }
  for (let i = 0; i < 63; i++) {
    const start = Math.max((i + .018) / 63, landingHigh), end = (i + .982) / 63;
    const landingFrame = start === landingHigh ? { point: v(0, .015, 11.505), across: v(1, 0, 0) } : undefined;
    for (let j = 0; j < 3; j++) {
      random(); // Preserve the established garden seed sequence after removing random slab rotations.
      if (start >= end) continue;
      const center = (j - 1) * .5;
      mesh(pathSlabGeometry(path, start, end, center - .245, center + .245, .09, landingFrame), (i + j) % 7 === 0 ? mats.stoneDark : mats.stone, null, garden).name = '顺曲线裁切铺石';
    }
    if (start >= end) continue;
    for (const sign of [-1, 1]) {
      mesh(pathSlabGeometry(path, start, end, sign * .84 - .0475, sign * .84 + .0475, .12, landingFrame), mats.stoneDark, null, garden).name = '顺曲线侧石';
    }
  }
  for (let i = 0; i < 93; i++) {
    const a = i / 93 * TAU, p = shoreEdge(a);
    if (p.z < 12 && Math.abs(p.x) < 1.35) continue;
    const rock = mesh(rockGeometry(.28 + random() * .28), i % 4 ? mats.stoneDark : mats.stone, p.add(v(0, -.13, 0)), garden);
    rock.scale.set(1.5, .55 + random() * .55, .8); rock.rotation.set(random(), random() * TAU, random());
  }
  const gate = new THREE.Group(); gate.name = '月洞门·桥头入园'; gate.position.set(4.7, .01, 16.3); gate.rotation.y = .57; garden.add(gate);
  const plaster = new THREE.MeshStandardMaterial({ name: '石灰抹面', color: '#d6d6c8', ...surfaces.plaster, normalScale: new THREE.Vector2(.4, .4), roughness: 1 });
  const gateCenterY = 1.17, gateRadius = 1.47, openingAngle = Math.asin(gateCenterY / gateRadius);
  const gateShape = new THREE.Shape(); gateShape.moveTo(-2.35, 0);
  gateShape.lineTo(-Math.sqrt(gateRadius ** 2 - gateCenterY ** 2), 0);
  gateShape.absarc(0, gateCenterY, gateRadius, Math.PI + openingAngle, -openingAngle, true);
  gateShape.lineTo(2.35, 0); gateShape.lineTo(2.35, 3.34); gateShape.lineTo(-2.35, 3.34); gateShape.closePath();
  mesh(new THREE.ExtrudeGeometry(gateShape, { depth: .38, bevelEnabled: true, bevelSize: .025, bevelThickness: .025, bevelSegments: 2, curveSegments: 64, steps: 1 }), plaster, v(0, 0, -.19), gate);
  for (const z of [-.218, .218]) mesh(new THREE.TorusGeometry(gateRadius + .015, .048, 6, 96, Math.PI + 2 * openingAngle), mats.stoneDark, v(0, gateCenterY, z), gate).rotation.z = -openingAngle;
  for (const x of [-1.93, 1.93]) {
    box(.85, .25, .45, x, .125, 0, mats.stoneDark, gate);
    for (let j = 0; j < 3; j++) box(.8, .014, .012, x, .4 + j * .24, .203, mats.stoneDark, gate);
  }
  for (const sign of [-1, 1]) {
    const cap = box(5.06, .09, .42, 0, 3.37, sign * .25, mats.tileDark, gate); cap.rotation.x = sign * .23;
    for (let i = 0; i < 38; i++) {
      const tile = mesh(clayTileGeometry(false), mats.tileLight, v((i - 18.5) * .13, 3.43, sign * .25), gate);
      tile.scale.set(.124, .13, .42); tile.rotation.set(sign * .23, sign < 0 ? Math.PI : 0, 0); detailCounts.roofTiles++;
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
    cylinder(.12, .07, .035, -.65, 1.4525, z, porcelain, 24);
    const cupShape = [[0,0],[.04,0],[.048,.012],[.06,.016],[.092,.084],[.091,.093],[.080,.096],[.075,.09],[.064,.027],[.03,.020],[0,.020]].map(p => new THREE.Vector2(...p));
    mesh(new THREE.LatheGeometry(cupShape, 24), porcelain, v(-.65, 1.47, z));
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
            dummy.scale.setScalar(.72 + random() * .65);
            dummy.scale.x *= .82 + detailRandom(leafMatrices.length, 21) * .32;
            dummy.rotateX((detailRandom(leafMatrices.length, 22) - .5) * .42); dummy.updateMatrix();
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
  const leafGroups = [0, 1, 2].map(variant => [peachLeafGeometry(variant), peachLeafMat, leafMatrices.filter((_, i) => i % 3 === variant), leafColors.filter((_, i) => i % 3 === variant), `桃叶·叶脉与卷曲·${variant + 1}`]);
  for (const [geometry, material, matrices, colors, name] of [...leafGroups, [blossomGeo, blossomMat, flowerMatrices, flowerColors, '五瓣桃花·逐枝着生']]) {
    const instances = new THREE.InstancedMesh(geometry, material, matrices.length); instances.name = name;
    matrices.forEach((m, i) => { instances.setMatrixAt(i, m); instances.setColorAt(i, colors[i]); });
    instances.castShadow = true; instances.receiveShadow = true; garden.add(instances);
  }
  const centers = new THREE.InstancedMesh(new THREE.SphereGeometry(.011, 6, 4), new THREE.MeshStandardMaterial({ color: '#bf8763', roughness: .8 }), flowerMatrices.length);
  centers.name = '桃花花心'; flowerMatrices.forEach((m, i) => centers.setMatrixAt(i, m.clone().multiply(new THREE.Matrix4().makeTranslation(0, .014, 0)))); garden.add(centers);
  detailCounts.leaves = leafMatrices.length; detailCounts.blossoms = flowerMatrices.length;

  // Short meadow cover and taller damp-bank tufts share geometry, but not a uniform distribution.
  const grassGeo = grassClumpGeometry(), grassStates = [];
  grassGeo.computeBoundingBox(); grassGeo.boundingBox.expandByVector(v(.026, 0, .013));
  grassGeo.boundingSphere = grassGeo.boundingBox.getBoundingSphere(new THREE.Sphere());
  const grassMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: .92, side: THREE.DoubleSide });
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
    const geometry = grassGeo.clone(); geometry.attributes.position.setUsage(THREE.DynamicDrawUsage); geometry.attributes.normal.setUsage(THREE.DynamicDrawUsage);
    const grass = new THREE.InstancedMesh(geometry, grassMaterial, instances.length); grass.name = `草坪·${key}`; grass.userData.deformingGeometry = true;
    instances.forEach(({matrix, color}, i) => { grass.setMatrixAt(i, matrix); grass.setColorAt(i, color); });
    grass.receiveShadow = true; grass.computeBoundingSphere(); garden.add(grass);
    const [px, pz] = key.split(',').map(Number);
    grassStates.push({ geometry, positions: grassGeo.attributes.position.array.slice(), normals: grassGeo.attributes.normal.array.slice(), x: (px + .5) * 5, z: (pz + .5) * 5 });
  }
  detailCounts.grass = grassCounts;
  root.userData.detailCounts = detailCounts;

  finishSurfaces(root);
  standardizeSurfaceMaterials(root);
  batchModel(root);
  root.userData.geometryMetrics = modelMetrics(root);
  root.userData.design = { type: 'original-artistic-pavilion', units: 'metres', roofDeckThickness: .055, pavingRadius: 3.74, revision: 6 };

  return {
    root, lanternMaterial: mats.lantern, lightPositions,
    update(time) {
      // About 1,200 shared vertices move per frame, instead of millions of shader evaluations.
      for (const state of grassStates) {
        const a = Math.sin(time * 1.15 + state.x * .72 + state.z * .58) * .026;
        const b = Math.sin(time * .83 + state.z * .65) * .013;
        const { position, normal } = state.geometry.attributes;
        for (let i = 0; i < position.count; i++) {
          const offset = i * 3, y = state.positions[offset + 1], weight = Math.min(1, Math.max(0, y / .34)) ** 2;
          position.setXYZ(i, state.positions[offset] + a * weight, y, state.positions[offset + 2] + b * weight);
          const derivative = y > 0 && y < .34 ? 2 * y / (.34 ** 2) : 0;
          const nx = state.normals[offset], nz = state.normals[offset + 2], ny = state.normals[offset + 1] - (nx * a + nz * b) * derivative;
          const length = Math.hypot(nx, ny, nz); normal.setXYZ(i, nx / length, ny / length, nz / length);
        }
        position.needsUpdate = true; normal.needsUpdate = true;
      }
      clothTime.value = time;
      for (const tie of curtainTies) {
        tie.position.z = clothProfile(0,CLOTH_TIE_Y).z + clothWave(CLOTH_TIE_Y,time,tie.userData.clothTiePhase).offset;
        tie.updateMatrixWorld(true);
      }
      lanterns.forEach((lamp, i) => {
        lamp.rotation.z = Math.sin(time * .63 + i) * .018;
        lamp.updateMatrixWorld(true);
        lightPositions[i].set(0, -.53, 0).applyMatrix4(lamp.matrixWorld);
      });
    },
  };
}
