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

// Every vertex lies on the roof profile, including the taper at the ridge.
// A sector is baked once and repeated six times, keeping only four roof draw groups.
export function conformalTileGeometry({ row, column, rows, lanes, pan, inner, outer, base, height }) {
  const nx = pan ? 4 : 6, nz = 2;
  const t0 = Math.max(0, (row - .22) / rows), t1 = (row + 1) / rows;
  const center = pan ? (column + .5) / lanes : column / lanes;
  const half = (pan ? .475 : .26) / lanes;
  const laneWidth = (inner + (outer - inner) * (t0 + t1) / 2) / lanes;
  const positions = [], uv = [], indices = [], layerSize = (nx + 1) * (nz + 1);
  for (let layer = 0; layer < 2; layer++) for (let z = 0; z <= nz; z++) for (let x = 0; x <= nx; x++) {
    const across = x / nx, along = z / nz, t = THREE.MathUtils.lerp(t0, t1, along), u = center + (across * 2 - 1) * half;
    const p = roofPoint(0, t, u, inner, outer, base, height);
    p.y += tileElevation(across, along, pan, laneWidth, layer === 1);
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
