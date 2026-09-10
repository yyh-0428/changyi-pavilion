import * as THREE from 'three';
import { beveledBoxGeometry } from './architecture-geometry.js';
import { createSurface } from './surface-materials.js';
import { detailRandom } from './surface-finishing.js';

export const MOON_GATE = Object.freeze({ radius: 1.47, centerY: 1.17, outerRadius: 1.70, bricks: 44, depth: .464 });
const v2 = (x, y) => new THREE.Vector2(x, y);

function clipAboveFloor(points, floor) {
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    if (a.y >= floor) out.push(a);
    if ((a.y - floor) * (b.y - floor) < 0) out.push(a.clone().lerp(b, (floor - a.y) / (b.y - a.y)));
  }
  return out;
}

// Real radial masonry, clipped at ground level. Front, back, intrados and joints
// receive metre-scaled UVs, including the curved reveal inside the opening.
export function moonBrickGeometry(start, end, { inner = 1.479, outer = 1.70, depth = MOON_GATE.depth, bevel = .005, segments = 4 } = {}) {
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const a = THREE.MathUtils.lerp(start, end, i / segments);
    points.push(v2(Math.cos(a) * outer, MOON_GATE.centerY + Math.sin(a) * outer));
  }
  for (let i = segments; i >= 0; i--) {
    const a = THREE.MathUtils.lerp(start, end, i / segments);
    points.push(v2(Math.cos(a) * inner, MOON_GATE.centerY + Math.sin(a) * inner));
  }
  const polygon = clipAboveFloor(points, .012 + bevel);
  const shape = new THREE.Shape(polygon); shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: depth - 2 * bevel, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, steps: 1 });
  geometry.translate(0, 0, -depth / 2 + bevel);
  const { position: p, normal: n, uv } = geometry.attributes;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i) - MOON_GATE.centerY;
    let a = Math.atan2(y, x);
    while (a < start - .01) a += Math.PI * 2;
    const radial = Math.hypot(x, y), along = (a - start) * (inner + outer) / 2;
    const cap = Math.abs(n.getZ(i)) > .5;
    const reveal = Math.abs((n.getX(i) * x + n.getY(i) * y) / radial) > .65;
    const middle = (start + end) / 2;
    // A planar face must stay planar in UV space: polar UVs collapse the
    // triangulator's small triangles between three points on the outer arc.
    const tangential = -Math.sin(middle) * x + Math.cos(middle) * y;
    const across = Math.cos(middle) * x + Math.sin(middle) * y - inner;
    uv.setXY(i, (cap ? tangential : reveal ? along : radial - inner) / .32, (cap ? across : p.getZ(i)) / .32);
  }
  return geometry;
}

function shade(geometry, index, material, weather = true) {
  const { position: p, normal: n, uv } = geometry.attributes;
  const color = new Float32Array(p.count * 3), variation = .88 + detailRandom(index, 101) * .12;
  const warmth = (detailRandom(index, 105) - .5) * .045;
  for (let i = 0; i < p.count; i++) {
    const damp = weather ? (1 - THREE.MathUtils.smoothstep(p.getY(i), .02, .46)) * .12 : 0;
    const edge = Math.max(Math.abs(n.getX(i)), Math.abs(n.getY(i)), Math.abs(n.getZ(i))) < .94 ? .025 : 0;
    const tone = variation - damp + edge;
    color.set([Math.min(1, tone + warmth), Math.min(1, tone + damp * .05), Math.min(1, tone - warmth - damp * .12)], i * 3);
    uv.setXY(i, uv.getX(i) + detailRandom(index, 106) * 5, uv.getY(i) + detailRandom(index, 107) * 5);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
  material.vertexColors = true;
  return geometry;
}

export function refineMoonGate({ gate, mats }) {
  // Preserve the established roof and its 76 tiles. Run after the original
  // surface pass so unrelated timber, stone, trees and grass keep their finish.
  for (const child of [...gate.children]) {
    if (child.userData.gateCoping) continue;
    child.removeFromParent(); child.geometry?.dispose();
  }
  const brickSurface = createSurface('gateBrick');
  const brick = new THREE.MeshStandardMaterial({ name: '月洞门·手作青砖', color: '#8b969b', ...brickSurface, normalScale: new THREE.Vector2(.55, .55), roughness: 1, vertexColors: true });
  const lime = new THREE.MeshStandardMaterial({ name: '月洞门·细砂灰泥', color: '#d6d6c8', ...createSurface('gateLime'), normalScale: new THREE.Vector2(.34, .34), roughness: 1, vertexColors: true });
  const mortar = new THREE.MeshStandardMaterial({ name: '月洞门·灰缝', color: '#747971', ...brickSurface, normalScale: new THREE.Vector2(.26, .26), roughness: 1 });
  const add = (geometry, material, name) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name;
    mesh.castShadow = true; mesh.receiveShadow = true; gate.add(mesh); return mesh;
  };
  const { centerY, radius, outerRadius, bricks } = MOON_GATE;
  const wallRadius = outerRadius + .016, wallAngle = Math.asin(centerY / wallRadius);
  const wallShape = new THREE.Shape(); wallShape.moveTo(-2.35, 0);
  wallShape.lineTo(-Math.sqrt(wallRadius ** 2 - centerY ** 2), 0);
  wallShape.absarc(0, centerY, wallRadius, Math.PI + wallAngle, -wallAngle, true);
  wallShape.lineTo(2.35, 0); wallShape.lineTo(2.35, 3.34); wallShape.lineTo(-2.35, 3.34); wallShape.closePath();
  const wallGeo = new THREE.ExtrudeGeometry(wallShape, { depth: .38, bevelEnabled: true, bevelSize: .006, bevelThickness: .006, bevelSegments: 2, curveSegments: 96, steps: 1 });
  wallGeo.translate(0, 0, -.19);
  const { position: wp, normal: wn, uv: wu } = wallGeo.attributes;
  for (let i = 0; i < wp.count; i++) wu.setXY(i, (Math.abs(wn.getZ(i)) > .5 ? wp.getX(i) : wp.getZ(i)) / .82, wp.getY(i) / .82);
  add(shade(wallGeo, 10, lime), lime, '月洞门·双面灰泥墙');
  const angle = Math.asin(centerY / radius), start = -angle, span = Math.PI + angle * 2;
  add(moonBrickGeometry(start, start + span, { inner: radius, outer: wallRadius, depth: .418, bevel: 0, segments: 176 }), mortar, '月洞门·内退灰缝底层');
  for (let i = 0; i < bricks; i++) {
    // 9 mm of recessed joint between chamfered voussoirs, on both faces.
    const joint = .0063;
    const geometry = moonBrickGeometry(start + i / bricks * span + joint, start + (i + 1) / bricks * span - joint);
    add(shade(geometry, 20 + i, brick), brick, `月洞门·径向券砖·${i + 1}`);
  }
  // Narrow outer fillet: a flat architectural reveal, rather than a round pipe.
  for (const z of [-.21, .21]) {
    const geometry = moonBrickGeometry(start, start + span, { inner: 1.718, outer: 1.746, depth: .026, bevel: .002, segments: 176 });
    geometry.translate(0, 0, z); add(shade(geometry, 90, brick), brick, '月洞门·外缘细线脚');
  }
  let wallBricks = 0;
  for (const sign of [-1, 1]) {
    // Stepped running-bond plinth stops outside the circle and never narrows it.
    for (let row = 0; row < 4; row++) {
      const y0 = .014 + row * .132, y1 = y0 + .12;
      const innerX = Math.sqrt(wallRadius ** 2 - (centerY - y1) ** 2) + .042;
      const width = 2.35 - innerX, count = row % 2 ? 3 : 2;
      for (let col = 0; col < count; col++) {
        const w = width / count - .009;
        const geometry = beveledBoxGeometry(w, .12, .424, .004);
        geometry.translate(sign * (innerX + width / count * (col + .5)), (y0 + y1) / 2, 0);
        const { position: p, normal: n, uv } = geometry.attributes;
        for (let i = 0; i < p.count; i++) uv.setXY(i, (Math.abs(n.getX(i)) > .5 ? p.getZ(i) : p.getX(i)) / .32, p.getY(i) / .32);
        add(shade(geometry, 100 + wallBricks, brick), brick, '月洞门·错缝墙裙'); wallBricks++;
      }
    }
  }
  // Low-relief four-petal medallions in the white spandrels, on both sides.
  for (const x of [-1.97, 1.97]) for (const z of [-.209, .209]) {
    const surround = new THREE.Mesh(new THREE.TorusGeometry(.148, .014, 5, 32), brick);
    surround.position.set(x, 2.54, z); surround.castShadow = true; surround.receiveShadow = true; gate.add(surround);
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2;
      const petal = new THREE.Mesh(new THREE.TorusGeometry(.048, .008, 4, 18), brick);
      petal.position.set(x + Math.cos(a) * .048, 2.54 + Math.sin(a) * .048, z);
      petal.castShadow = true; petal.receiveShadow = true; gate.add(petal);
    }
  }
  gate.userData.masonry = { ...MOON_GATE, wallBricks, jointDepth: .023, uvMetres: .32, twoSided: true };
  return { ringBricks: bricks, wallBricks, medallions: 4 };
}
