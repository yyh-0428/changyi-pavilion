import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { detailRandom } from './surface-finishing.js';

export const ROOF_COLOR_SCALE = 1.1;

export function roofPoint(sector, t, u, inner, outer, base, height) {
  const a = sector * Math.PI / 3, b = a + Math.PI / 3, radius = inner + (outer - inner) * t;
  return new THREE.Vector3(
    THREE.MathUtils.lerp(Math.cos(a), Math.cos(b), u) * radius,
    base + height * (1 - t) ** 1.75 + .10 * t ** 7 + .34 * t ** 4 * (2 * u - 1) ** 6,
    THREE.MathUtils.lerp(Math.sin(a), Math.sin(b), u) * radius,
  );
}

export function tileElevation(across, along, pan, laneWidth, underside = false) {
  const thickness = Math.min(.005, laneWidth * .06);
  const lap = (thickness + .011) * along;
  const curve = pan ? Math.min(.017, laneWidth * .13) * (2 * across - 1) ** 2
    : Math.min(.035, laneWidth * .23) * Math.sin(Math.PI * across);
  const seat = pan ? thickness + .003 : Math.min(.017, laneWidth * .13) + thickness * 2 + .009;
  return seat + curve + lap - (underside ? thickness : 0);
}

function tilePoint(spec, across, along) {
  const { row, column, rows, lanes, pan, inner, outer, base, height } = spec;
  const t0 = Math.max(0, (row - .22) / rows), t1 = (row + 1) / rows;
  const center = (column + (pan ? .5 : 0)) / lanes, half = (pan ? .475 : .26) / lanes;
  const width = (inner + (outer - inner) * (t0 + t1) / 2) / lanes;
  const p = roofPoint(0, THREE.MathUtils.lerp(t0, t1, along), center + (across * 2 - 1) * half, inner, outer, base, height);
  p.y += tileElevation(across, along, pan, width);
  return p;
}

// Sample the next tile's actual triangle plane, including the crown taper and
// curved eave. An analytic roof height alone misses its chord/arch interpolation.
function tileContactHeight(spec, across, along) {
  const nx = spec.pan ? 4 : 6, x = Math.min(nx - 1, Math.floor(across * nx));
  const z = Math.min(1, Math.floor(along * 2));
  const point = tilePoint(spec, across, along);
  const corners = [tilePoint(spec, x / nx, z / 2), tilePoint(spec, (x + 1) / nx, z / 2),
    tilePoint(spec, x / nx, (z + 1) / 2), tilePoint(spec, (x + 1) / nx, (z + 1) / 2)];
  for (const ids of [[0, 1, 2], [2, 1, 3]]) {
    const [a, b, c] = ids.map(i => corners[i]);
    const den = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
    const u = ((b.z - c.z) * (point.x - c.x) + (c.x - b.x) * (point.z - c.z)) / den;
    const v = ((c.z - a.z) * (point.x - c.x) + (a.x - c.x) * (point.z - c.z)) / den;
    if (u >= -1e-7 && v >= -1e-7 && u + v <= 1 + 1e-7) return u * a.y + v * b.y + (1 - u - v) * c.y;
  }
  throw new Error('Tile contact lies outside the adjacent shell');
}

// The raised hip caps also need a bed: their original ceramic shells sit
// 65 mm above the roof and otherwise leave daylight along the roof silhouette.
export function hipTileBeddingGeometry(shell, transform, sector, spec) {
  const geometry = shell.clone(), p = geometry.attributes.position, layerSize = shell.userData.shellLayerSize;
  const point = new THREE.Vector3(), local = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const bottom = i < layerSize * 2 ? i >= layerSize : (i - layerSize * 2) % 4 >= 2;
    point.fromBufferAttribute(p, i);
    // Copy the cap's underside exactly, then extend only the concealed bed.
    if (!bottom) point.y -= .09;
    point.applyMatrix4(transform);
    if (bottom) {
      local.copy(point).applyAxisAngle(new THREE.Vector3(0, 1, 0), sector * Math.PI / 3);
      local.z = Math.abs(local.z);
      const radius = local.x + local.z / Math.sqrt(3);
      const t = THREE.MathUtils.clamp((radius - spec.inner) / (spec.outer - spec.inner), 0, 1);
      const u = THREE.MathUtils.clamp(2 * local.z / (Math.sqrt(3) * radius), 0, 1);
      point.y = Math.min(point.y - .001, roofPoint(0, t, u, spec.inner, spec.outer, spec.base, spec.height).y - .002);
    } else point.y += .0007;
    p.setXYZ(i, point.x, point.y, point.z);
  }
  geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

// Every vertex lies on the roof profile, including the taper at the ridge.
// A sector is baked once and repeated six times, keeping only four roof draw groups.
export function conformalTileGeometry({ row, column, rows, lanes, pan, inner, outer, base, height }) {
  const nx = pan ? 4 : 6, nz = 2;
  const t0 = Math.max(0, (row - .22) / rows), t1 = (row + 1) / rows;
  const center = pan ? (column + .5) / lanes : column / lanes;
  const half = (pan ? .475 : .26) / lanes;
  const laneWidth = (inner + (outer - inner) * (t0 + t1) / 2) / lanes;
  const spec = { row, column, rows, lanes, pan, inner, outer, base, height };
  const hasLap = row < rows - 1, next0 = (row + .78) / rows, next1 = (row + 2) / rows;
  const positions = [], uv = [], indices = [], layerSize = (nx + 1) * (nz + 1);
  for (let layer = 0; layer < 2; layer++) for (let z = 0; z <= nz; z++) for (let x = 0; x <= nx; x++) {
    const across = x / nx;
    // Reuse the three underside rings: the middle one starts the contact band.
    // The visible top and final eave lip keep their original profile and budget.
    const t = layer && hasLap && z === 1 ? next0 : THREE.MathUtils.lerp(t0, t1, z / nz);
    const along = (t - t0) / (t1 - t0), u = center + (across * 2 - 1) * half;
    const p = roofPoint(0, t, u, inner, outer, base, height);
    p.y += tileElevation(across, along, pan, laneWidth, layer === 1);
    if (layer && hasLap && z > 0) {
      // Embed the hidden bearing face by 1 mm, avoiding coplanar flicker.
      p.y = Math.min(p.y, tileContactHeight({ ...spec, row: row + 1 }, across, (t - next0) / (next1 - next0)) - .001);
    }
    positions.push(p.x, p.y, p.z); uv.push(across, along);
    if (x < nx && z < nz) {
      const a = layer * layerSize + z * (nx + 1) + x, b = a + nx + 1;
      if (!layer) indices.push(a, a + 1, b, b, a + 1, b + 1);
      else indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const boundary = [];
  for (let x = 0; x <= nx; x++) boundary.push(x);
  for (let z = 1; z <= nz; z++) boundary.push(z * (nx + 1) + nx);
  for (let x = nx - 1; x >= 0; x--) boundary.push(nz * (nx + 1) + x);
  for (let z = nz - 1; z > 0; z--) boundary.push(z * (nx + 1));
  for (let i = 0; i < boundary.length; i++) {
    const a = boundary[i], b = boundary[(i + 1) % boundary.length], offset = positions.length / 3;
    for (const vertex of [a, b, a + layerSize, b + layerSize]) {
      positions.push(...positions.slice(vertex * 3, vertex * 3 + 3));
    }
    uv.push(0,0,1,0,0,1,1,1);
    indices.push(offset, offset + 2, offset + 1, offset + 1, offset + 2, offset + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

export function roofTileSectors(spec, pan, tileColors, sectorColors, material) {
  const geometries = [], colors = tileColors;
  let tile = 0;
  for (let row = 0; row < spec.rows; row++) for (let column = pan ? 0 : 1; column < spec.lanes; column++) {
    const geometry = conformalTileGeometry({ ...spec, row, column, pan });
    const color = colors[tile++], rgb = new Uint8Array(geometry.attributes.position.count * 3);
    const { uv } = geometry.attributes, nx = pan ? 4 : 6, shellVertices = (nx + 1) * 3 * 2;
    const offsetU = detailRandom(tile, 11) * 13, offsetV = detailRandom(tile, 18) * 13;
    // Different areas of the kiln texture for each tile; coherent water marks
    // remain at lap lines, while exposed cut edges show the lighter clay body.
    for (let i = 0; i < uv.count; i++) {
      const along = i < shellVertices ? (Math.floor(i / (nx + 1)) % 3) / 2 : 1;
      const edge = i >= shellVertices;
      const weather = edge ? 1.09 : .94 + along * .055;
      const cool = pan ? .008 * (1 - along) : 0;
      rgb.set([color.r * weather, color.g * weather, color.b * weather + cool].map(c => Math.round(THREE.MathUtils.clamp(c / ROOF_COLOR_SCALE, 0, 1) * 255)), i * 3);
      uv.setXY(i, uv.getX(i) * .59 + offsetU, uv.getY(i) * .83 + offsetV);
    }
    geometry.setAttribute('color', new THREE.Uint8BufferAttribute(rgb, 3, true)); geometries.push(geometry);
  }
  const geometry = mergeGeometries(geometries);
  for (const part of geometries) part.dispose();
  const mesh = new THREE.InstancedMesh(geometry, material, 6);
  for (let sector = 0; sector < 6; sector++) {
    mesh.setMatrixAt(sector, new THREE.Matrix4().makeRotationY(-sector * Math.PI / 3));
    mesh.setColorAt(sector, sectorColors[sector]);
  }
  mesh.userData.tileCount = tile * 6;
  mesh.userData.roofSpec = spec;
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}
