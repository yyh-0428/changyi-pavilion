import * as THREE from 'three';

const v = (x, y, z) => new THREE.Vector3(x, y, z);

export function addPavilionCraft({ mesh, box, beam, cylinder, tube, mats, endgrain, corners }) {
  const counts = { ashlarBlocks: 0, timberPegs: 0, bracketKeys: 0 };
  // Recessed beds remain between separate, chamfered ashlar faces.
  for (const [radius, y, h, blocks] of [[4.045, .32, .302, 7], [4.211, .03, .22, 8]]) {
    for (let side = 0; side < 6; side++) {
      const a = v(Math.cos(side * Math.PI / 3) * radius, y, Math.sin(side * Math.PI / 3) * radius);
      const b = v(Math.cos((side + 1) * Math.PI / 3) * radius, y, Math.sin((side + 1) * Math.PI / 3) * radius);
      for (let j = 0; j < blocks; j++) {
        const start = a.clone().lerp(b, (j + .012) / blocks), end = a.clone().lerp(b, (j + .988) / blocks);
        beam(start, end, .045, h, mats.stone).name = '台基·独立灰石砌块'; counts.ashlarBlocks++;
      }
    }
  }
  // Timber pegs are flush with the surface; grain on their ends is radial.
  for (let i = 0; i < 6; i++) {
    const p = corners[i], next = corners[(i + 1) % 6];
    const radial = p.clone().normalize();
    for (const y of [3.66, 4.02]) {
      const radius = y > 3.9 ? .153 : .158;
      const center = p.clone().addScaledVector(radial, radius); center.y = y;
      const peg = cylinder(.016, .016, .006, ...center.toArray(), endgrain, 12);
      peg.quaternion.setFromUnitVectors(v(0, 1, 0), radial); peg.name = '木柱·透榫木销'; counts.timberPegs++;
    }
    for (let tier = 0; tier < 3; tier++) {
      const armY = 4.34 + tier * .18, length = .56 + tier * .22;
      for (const sign of [-1, 1]) {
        const tip = p.clone().addScaledVector(radial, sign * (length * .5 - .015)); tip.y = armY + .014;
        const key = box(.026, .044, .09, ...tip.toArray(), endgrain);
        key.rotation.y = -i * Math.PI / 3; key.name = '斗拱·出榫端头'; counts.bracketKeys++;
      }
    }
    if (i !== 1) {
      const a = p.clone().multiplyScalar(.86), b = next.clone().multiplyScalar(.86), along = b.clone().sub(a).normalize();
      const normal = v(along.z, 0, -along.x);
      // Split seat planks are separated by a fine recessed join at the top.
      for (const offset of [-.093, .093]) {
        const start = a.clone().addScaledVector(normal, offset); start.y = 1.219;
        const end = b.clone().addScaledVector(normal, offset); end.y = 1.219;
        beam(start, end, .177, .016, mats.darkWood).name = '坐凳·双拼木板';
      }
      for (const t of [.10, .90]) {
        const seat = a.clone().lerp(b, t); seat.y = 1.2278;
        cylinder(.008, .008, .002, ...seat.toArray(), endgrain, 8).name = '坐凳·木销';
      }
    }
  }
  // Raised frame around the original lettering, preserving the supplied atlas.
  for (const sign of [-1, 1]) {
    box(1.67, .027, .030, 0, 3.95 + sign * .266, 2.866, mats.darkWood).name = '匾额·实木边框';
    box(.027, .505, .030, sign * .82, 3.95, 2.866, mats.darkWood).name = '匾额·实木边框';
    for (const x of [-.78, .78]) {
      const pin = cylinder(.010, .010, .005, x, 3.95 + sign * .222, 2.885, mats.brass, 10);
      pin.rotation.x = Math.PI / 2; pin.name = '匾框·旧铜钉';
    }
  }
  return counts;
}
