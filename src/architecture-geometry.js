import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Six original planes, twelve edge chamfers and eight corner cuts. All vertices
// stay inside the original box, so existing joints and clearances cannot grow.
export function beveledBoxGeometry(width, height, depth, radius = .003) {
  if (![width, height, depth, radius].every(value => Number.isFinite(value) && value > 0)) throw new Error('Invalid bevel dimensions');
  const half = [width / 2, height / 2, depth / 2], r = Math.min(radius, ...half.map(value => value * .25));
  const inner = half.map(value => value - r), positions = [], normals = [], uvs = [], indices = [];
  function face(points, direction) {
    const normal = new THREE.Vector3(...direction).normalize();
    const p = points.map(point => new THREE.Vector3(...point));
    if (p[1].clone().sub(p[0]).cross(p[2].clone().sub(p[0])).dot(normal) < 0) p.reverse();
    const axis = direction.findIndex(value => Math.abs(value) === Math.max(...direction.map(Math.abs)));
    const a = (axis + 1) % 3, b = (axis + 2) % 3, start = positions.length / 3;
    for (const point of p) {
      positions.push(...point.toArray()); normals.push(...normal.toArray());
      uvs.push(point.getComponent(a) / (half[a] * 2) + .5, point.getComponent(b) / (half[b] * 2) + .5);
    }
    for (let i = 1; i < p.length - 1; i++) indices.push(start, start + i, start + i + 1);
  }
  for (let axis = 0; axis < 3; axis++) for (const sign of [-1, 1]) {
    const a = (axis + 1) % 3, b = (axis + 2) % 3, direction = [0, 0, 0]; direction[axis] = sign;
    face([[-1,-1],[1,-1],[1,1],[-1,1]].map(([sa, sb]) => {
      const point = [0, 0, 0]; point[axis] = half[axis] * sign; point[a] = inner[a] * sa; point[b] = inner[b] * sb; return point;
    }), direction);
    for (const otherSign of [-1, 1]) {
      const direction = [0, 0, 0]; direction[axis] = sign; direction[a] = otherSign;
      face([[0,-1],[1,-1],[1,1],[0,1]].map(([side, end]) => {
        const point = [0, 0, 0]; point[axis] = (side ? inner[axis] : half[axis]) * sign;
        point[a] = (side ? half[a] : inner[a]) * otherSign; point[b] = inner[b] * end; return point;
      }), direction);
    }
  }
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
    const sign = [x, y, z];
    face([0, 1, 2].map(axis => inner.map((value, i) => (i === axis ? half[i] : value) * sign[i])), sign);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices);
  return geometry;
}

export function hexRingGeometry(radius, width, height) {
  const outer = radius + width / (2 * Math.cos(Math.PI / 6)), inner = radius - width / (2 * Math.cos(Math.PI / 6));
  const shape = new THREE.Shape(), hole = new THREE.Path();
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    if (!i) { shape.moveTo(Math.cos(a) * outer, Math.sin(a) * outer); hole.moveTo(Math.cos(-a) * inner, Math.sin(-a) * inner); }
    else { shape.lineTo(Math.cos(a) * outer, Math.sin(a) * outer); hole.lineTo(Math.cos(-a) * inner, Math.sin(-a) * inner); }
  }
  shape.closePath(); hole.closePath(); shape.holes.push(hole);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, steps: 1 });
  geometry.rotateX(-Math.PI / 2); geometry.translate(0, -height / 2, 0);
  const { position: p, normal: n, uv } = geometry.attributes;
  // Assign each face to its own mitred beam, with longitudinal grain.
  const step = Math.PI / 3;
  for (let i = 0; i < p.count; i += 3) {
    const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
    const cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    const a = (Math.floor((Math.atan2(cz, cx) + Math.PI * 2) / step) + .5) * step;
    for (let j = i; j < i + 3; j++) {
      const along = -Math.sin(a) * p.getX(j) + Math.cos(a) * p.getZ(j);
      const across = Math.abs(n.getY(j)) > .5 ? Math.cos(a) * p.getX(j) + Math.sin(a) * p.getZ(j) : p.getY(j);
      uv.setXY(j, across / .22, along / 2);
    }
  }
  return geometry;
}

function clipHalfPlane(points, normal, distance) {
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const da = normal.dot(a) - distance, db = normal.dot(b) - distance;
    if (da >= -1e-9) out.push(a);
    if (da * db < 0) out.push(a.clone().lerp(b, da / (da - db)));
  }
  return out;
}

export function joinedLatticeGeometry(width, height, bar = .033, depth = .033) {
  const length = Math.hypot(width, height), normal = new THREE.Vector2(-height / length, width / length);
  const rectangle = sign => {
    const a = new THREE.Vector2(-width / 2, -sign * height / 2), b = new THREE.Vector2(width / 2, sign * height / 2);
    const n = new THREE.Vector2(-sign * height / length, width / length).multiplyScalar(bar / 2);
    return [a.clone().add(n), a.clone().sub(n), b.clone().sub(n), b.clone().add(n)];
  };
  const polygons = [rectangle(1), clipHalfPlane(rectangle(-1), normal, bar / 2 + .0005), clipHalfPlane(rectangle(-1), normal.clone().negate(), bar / 2 + .0005)];
  const geometries = polygons.map(points => {
    const geometry = new THREE.ExtrudeGeometry(new THREE.Shape(points), { depth, bevelEnabled: false, steps: 1 });
    geometry.translate(0, 0, -depth / 2); return geometry;
  });
  const geometry = mergeGeometries(geometries); geometries.forEach(g => g.dispose()); return geometry;
}

// Neighbouring slabs share a curve cross-section, with an explicit narrow joint.
export function pathSlabGeometry(curve, start, end, left, right, thickness, startFrame) {
  const positions = [], indices = [], uvs = [];
  for (let layer = 0; layer < 2; layer++) for (let i = 0; i <= 2; i++) {
    const t = THREE.MathUtils.lerp(start, end, i / 2), p = curve.getPointAt(t), direction = curve.getTangentAt(t);
    const across = new THREE.Vector3(direction.z, 0, -direction.x).normalize();
    if (i === 0 && startFrame) { p.copy(startFrame.point); across.copy(startFrame.across); }
    for (const offset of [left, right]) {
      const point = p.clone().addScaledVector(across, offset); positions.push(point.x, point.y + (layer ? -.5 : .5) * thickness, point.z); uvs.push(point.x, point.z);
    }
  }
  for (let i = 0; i < 2; i++) {
    const a = i * 2; indices.push(a,a+2,a+1,a+1,a+2,a+3, a+6,a+7,a+8,a+7,a+9,a+8);
  }
  const boundary = [0,1,3,5,4,2];
  for (let i = 0; i < boundary.length; i++) {
    const a = boundary[i], b = boundary[(i + 1) % boundary.length], offset = positions.length / 3;
    const edgeLength = new THREE.Vector3(...positions.slice(a*3,a*3+3)).distanceTo(new THREE.Vector3(...positions.slice(b*3,b*3+3)));
    for (const vertex of [a,b,a+6,b+6]) positions.push(...positions.slice(vertex*3,vertex*3+3));
    uvs.push(0,thickness,edgeLength,thickness,0,0,edgeLength,0);
    indices.push(offset,offset+1,offset+2,offset+1,offset+3,offset+2);
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions,3)); geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2)); geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

// The perimeter stays inside the original cut; both top and side faces catch
// light along a real narrow chamfer instead of a painted outline.
export function dressedSlabGeometry(top, thickness, bevel = .004, topTriangles) {
  const r = Math.min(bevel, thickness / 4);
  const contour = top.map(p => new THREE.Vector2(p.x, p.z));
  const ccw = THREE.ShapeUtils.area(contour) > 0;
  const inner = top.map((p, i) => {
    const prev = contour[(i + top.length - 1) % top.length], curr = contour[i], next = contour[(i + 1) % top.length];
    const a = curr.clone().sub(prev).normalize(), b = next.clone().sub(curr).normalize();
    const na = new THREE.Vector2(-a.y, a.x).multiplyScalar(ccw ? 1 : -1);
    const nb = new THREE.Vector2(-b.y, b.x).multiplyScalar(ccw ? 1 : -1);
    const shift = na.clone().add(nb).multiplyScalar(r / Math.max(.15, 1 + na.dot(nb)));
    if (shift.length() > r * 2.5) shift.setLength(r * 2.5);
    return p.clone().add(new THREE.Vector3(shift.x, 0, shift.y));
  });
  const rings = [inner, top.map(p => p.clone().add(new THREE.Vector3(0, -r, 0))), top.map(p => p.clone().add(new THREE.Vector3(0, r - thickness, 0))), inner.map(p => p.clone().add(new THREE.Vector3(0, -thickness, 0)))];
  const positions = [], uvs = [], indices = [];
  const center = top.reduce((sum, p) => sum.add(p), new THREE.Vector3()).multiplyScalar(1 / top.length);
  function face(vertices, expected) {
    if (vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0])).dot(expected) < 0) vertices.reverse();
    const start = positions.length / 3;
    const horizontal = Math.abs(expected.y) > .9;
    for (const p of vertices) { positions.push(p.x, p.y, p.z); uvs.push(horizontal ? p.x * 1.3 : (Math.abs(expected.x) > Math.abs(expected.z) ? p.z : p.x) * 1.3, horizontal ? p.z * 1.3 : p.y * 1.3); }
    for (let i = 1; i < vertices.length - 1; i++) indices.push(start, start + i, start + i + 1);
  }
  const triangles = topTriangles || THREE.ShapeUtils.triangulateShape(inner.map(p => new THREE.Vector2(p.x, p.z)), []);
  for (const triangle of triangles) {
    face(triangle.map(i => rings[0][i]), new THREE.Vector3(0, 1, 0));
    face(triangle.map(i => rings[3][i]), new THREE.Vector3(0, -1, 0));
  }
  for (let level = 0; level < 3; level++) for (let i = 0; i < top.length; i++) {
    const j = (i + 1) % top.length, out = top[i].clone().add(top[j]).multiplyScalar(.5).sub(center); out.y = 0;
    face([rings[level][i], rings[level][j], rings[level + 1][j], rings[level + 1][i]], out);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

export function dressedPathSlabGeometry(curve, start, end, left, right, thickness, startFrame) {
  const source = pathSlabGeometry(curve, start, end, left, right, thickness, startFrame);
  const top = [0, 1, 3, 5, 4, 2].map(i => new THREE.Vector3().fromBufferAttribute(source.attributes.position, i));
  const geometry = dressedSlabGeometry(top, thickness, Math.min(.005, (right - left) * .06), [[0, 1, 5], [1, 2, 5], [5, 2, 4], [2, 3, 4]]);
  source.dispose(); return geometry;
}

// Clip a paving rectangle to the six faces of a point-on-X regular hexagon.
export function clipToHexagon(points, radius) {
  const apothem = radius * Math.cos(Math.PI / 6);
  let polygon = points.map(point => point.clone());
  for (let side = 0; side < 6 && polygon.length; side++) {
    const angle = Math.PI / 6 + side * Math.PI / 3;
    const nx = Math.cos(angle), nz = Math.sin(angle), output = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length];
      const da = a.x * nx + a.y * nz - apothem, db = b.x * nx + b.y * nz - apothem;
      if (da <= 1e-9) output.push(a);
      if ((da < -1e-9 && db > 1e-9) || (da > 1e-9 && db < -1e-9)) output.push(a.clone().lerp(b, da / (da - db)));
    }
    polygon = output;
  }
  return polygon.filter((p, i) => p.distanceToSquared(polygon[(i + 1) % polygon.length]) > 1e-12);
}

export function pavingStoneGeometry(points) {
  // Tiny cut boundary fragments use a proportionally smaller chamfer.
  const shortest = Math.min(...points.map((p, i) => p.distanceTo(points[(i + 1) % points.length])));
  const geometry = dressedSlabGeometry(points.map(p => new THREE.Vector3(p.x, .012, p.y)), .012, Math.min(.0025, shortest * .08));
  // A consistent world scale for stone grain, including cut boundary stones.
  const { position, normal, uv } = geometry.attributes;
  for (let i = 0; i < position.count; i++) {
    if (Math.abs(normal.getY(i)) > .5) uv.setXY(i, position.getX(i) * 1.3, position.getZ(i) * 1.3);
    else uv.setXY(i, (Math.abs(normal.getX(i)) > .5 ? position.getZ(i) : position.getX(i)) * 1.3, position.getY(i) * 1.3);
  }
  return geometry;
}

export function columnBaseGeometry() {
  const geometry = new THREE.LatheGeometry([
    [0, 0], [.267, 0], [.28, .018], [.28, .085], [.257, .112],
    [.222, .135], [.205, .17], [.205, .255], [.19, .285], [0, .285],
  ].map(p => new THREE.Vector2(...p)), 24);
  const { position, normal, uv } = geometry.attributes;
  for (let i = 0; i < position.count; i++) {
    if (Math.abs(normal.getY(i)) > .8) uv.setXY(i, position.getX(i) * 1.3, position.getZ(i) * 1.3);
    else uv.setXY(i, uv.getX(i) * 2, position.getY(i) * 1.3);
  }
  return geometry;
}

export function timberColumnGeometry() {
  const geometry = new THREE.LatheGeometry([
    [0, 0], [.174, 0], [.177, .3], [.171, 1.2], [.157, 2.35], [.14, 3.35], [0, 3.35],
  ].map(p => new THREE.Vector2(...p)), 24);
  const { position, uv } = geometry.attributes;
  for (let i = 0; i < position.count; i++) uv.setXY(i, uv.getX(i) * 5, position.getY(i) / 2);
  return geometry;
}

export function bracketArmGeometry(length) {
  const half = length / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-half, .052); shape.lineTo(half, .052);
  shape.lineTo(half, -.003);
  shape.quadraticCurveTo(half - .07, -.003, half - .12, -.07);
  shape.lineTo(-half + .12, -.07);
  shape.quadraticCurveTo(-half + .07, -.003, -half, -.003);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: .145, bevelEnabled: false, curveSegments: 3, steps: 1 });
  geometry.translate(0, 0, -.0725); return geometry;
}

export function bridgeHeight(t) { return -.03 + Math.sin(t * Math.PI) * .46; }

export function archStoneGeometry(start, end) {
  // The joint follows the curve's normal, so adjacent voussoirs meet without box overlap.
  const point = (t, side) => {
    const slope = Math.cos(t * Math.PI) * .46 * Math.PI / 6.5;
    const length = Math.hypot(1, slope);
    const z = 5 + t * 6.5 - side * .16 * slope / length;
    const y = bridgeHeight(t) - .24 + side * .16 / length;
    return new THREE.Vector2(-z, y);
  };
  const points = [];
  for (let i = 0; i <= 2; i++) points.push(point(THREE.MathUtils.lerp(start, end, i / 2), 1));
  for (let i = 2; i >= 0; i--) points.push(point(THREE.MathUtils.lerp(start, end, i / 2), -1));
  const geometry = new THREE.ExtrudeGeometry(new THREE.Shape(points), { depth: .21, bevelEnabled: false, steps: 1 });
  geometry.rotateY(Math.PI / 2); geometry.translate(-.105, 0, 0); return geometry;
}
