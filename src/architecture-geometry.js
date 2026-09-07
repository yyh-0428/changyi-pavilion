import * as THREE from 'three';

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
  const shape = new THREE.Shape(points.map(p => new THREE.Vector2(p.x, -p.y)));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: .012, bevelEnabled: false, steps: 1 });
  geometry.rotateX(-Math.PI / 2);
  // A consistent world scale for stone grain, including cut boundary stones.
  const { position, uv } = geometry.attributes;
  for (let i = 0; i < position.count; i++) uv.setXY(i, position.getX(i) * 1.3, position.getZ(i) * 1.3);
  return geometry;
}

export function columnBaseGeometry() {
  return new THREE.LatheGeometry([
    [0, 0], [.267, 0], [.28, .018], [.28, .085], [.257, .112],
    [.222, .135], [.205, .17], [.205, .255], [.19, .285], [0, .285],
  ].map(p => new THREE.Vector2(...p)), 24);
}

export function timberColumnGeometry() {
  const geometry = new THREE.LatheGeometry([
    [0, 0], [.174, 0], [.177, .3], [.171, 1.2], [.157, 2.35], [.14, 3.35], [0, 3.35],
  ].map(p => new THREE.Vector2(...p)), 24);
  const { position, uv } = geometry.attributes;
  for (let i = 0; i < position.count; i++) uv.setY(i, position.getY(i) / 3.35);
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
