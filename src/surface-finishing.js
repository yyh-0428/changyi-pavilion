import * as THREE from 'three';

// Independent of the placement PRNG: surface edits never move a single grass tuft.
export function detailRandom(index, salt = 0) {
  let n = Math.imul(index + 1, 1597334677) ^ Math.imul(salt + 17, 3812015801);
  n = Math.imul(n ^ (n >>> 16), 2246822519);
  return ((n ^ (n >>> 13)) >>> 0) / 4294967296;
}

export function timberUV(geometry, axis = 'y') {
  const { position: p, normal: n, uv } = geometry.attributes;
  const along = { x: 0, y: 1, z: 2 }[axis], a = (along + 1) % 3, b = (along + 2) % 3;
  const point = new THREE.Vector3(), normal = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    point.fromBufferAttribute(p, i); normal.fromBufferAttribute(n, i);
    if (Math.abs(normal.getComponent(along)) > .95) uv.setXY(i, point.getComponent(a) / .22 + .5, point.getComponent(b) / .22 + .5);
    else uv.setXY(i, point.getComponent(Math.abs(normal.getComponent(a)) > Math.abs(normal.getComponent(b)) ? b : a) / .22 + .5, point.getComponent(along) / 2 + .5);
  }
  return geometry;
}

export function finishSurfaces(root) {
  root.updateMatrixWorld(true);
  let id = 0;
  const world = new THREE.Vector3();
  root.traverse(object => {
    if (!object.isMesh || object.isInstancedMesh) return;
    const name = object.material.name;
    const stone = name === 'stone' || name === 'stoneDark';
    const timber = name === 'wood' || name === 'darkWood' || name === '木端面';
    const bark = name === 'bark', plaster = name === '石灰抹面';
    const ceramic = name === 'tile' || name === 'tileLight';
    if (!(stone || timber || bark || plaster || ceramic)) return;
    const seed = ++id, geometry = object.geometry.clone();
    object.geometry = geometry;
    const { position: p, normal: n, uv } = geometry.attributes;
    const colors = new Float32Array(p.count * 3);
    const variation = stone ? .82 + detailRandom(seed, 1) * .18 : timber ? .86 + detailRandom(seed, 1) * .14 : .9 + detailRandom(seed, 1) * .10;
    const warmth = (detailRandom(seed, 2) - .5) * (stone ? .065 : .035);
    const ou = detailRandom(seed, 3) * 8, ov = detailRandom(seed, 4) * 8;
    for (let i = 0; i < p.count; i++) {
      world.fromBufferAttribute(p, i).applyMatrix4(object.matrixWorld);
      if (uv && name !== '木端面') {
        if (plaster) {
          const side = Math.abs(n.getZ(i)) > .5;
          uv.setXY(i, (side ? p.getX(i) : p.getZ(i)) * 1.2 + ou, p.getY(i) * 1.2 + ov);
        } else uv.setXY(i, uv.getX(i) + ou, uv.getY(i) + ov);
      }
      // Localized moisture/patina changes reflectance, not the lighting solution.
      const damp = stone || plaster ? THREE.MathUtils.smoothstep(.22 - world.y, 0, .25) : bark ? THREE.MathUtils.smoothstep(.32 - p.getY(i), 0, .4) : 0;
      const edge = stone && Math.max(Math.abs(n.getX(i)), Math.abs(n.getY(i)), Math.abs(n.getZ(i))) < .92 ? .055 : 0;
      const grain = bark ? Math.sin(p.getY(i) * 4.7 + p.getX(i) * 7) * .025 : 0;
      const shade = variation - damp * .19 + edge + grain;
      colors.set([THREE.MathUtils.clamp(shade + warmth - damp * .025, .5, 1), THREE.MathUtils.clamp(shade + damp * .012, .5, 1), THREE.MathUtils.clamp(shade - warmth - damp * .035, .5, 1)], i * 3);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    object.material.vertexColors = true;
  });
}
