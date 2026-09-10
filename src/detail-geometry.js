import * as THREE from 'three';

export function clayTileGeometry(pan = false) {
  const positions = [], uvs = [], indices = [];
  // Longitudinal taper is linear: extra lengthwise rings add no shape detail.
  const nx = pan ? 6 : 8, nz = 1, layerSize = (nx + 1) * (nz + 1);
  for (let layer = 0; layer < 2; layer++) {
    for (let z = 0; z <= nz; z++) for (let x = 0; x <= nx; x++) {
      const u = x / nx, t = z / nz;
      const arch = Math.sin(u * Math.PI) * (pan ? -.14 : .42);
      positions.push((u - .5) * (.94 + .06 * t), arch - layer * .09 + .18 * t, t - .5);
      uvs.push(u, t);
      if (x < nx && z < nz) {
        const a = layer * layerSize + z * (nx + 1) + x, b = a + nx + 1;
        if (layer === 0) indices.push(a, b, a + 1, b, b + 1, a + 1);
        else indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }
  const boundary = [];
  for (let x = 0; x <= nx; x++) boundary.push(x);
  for (let z = 1; z <= nz; z++) boundary.push(z * (nx + 1) + nx);
  for (let x = nx - 1; x >= 0; x--) boundary.push(nz * (nx + 1) + x);
  for (let z = nz - 1; z > 0; z--) boundary.push(z * (nx + 1));
  for (let i = 0; i < boundary.length; i++) {
    const a = boundary[i], b = boundary[(i + 1) % boundary.length];
    // Split the cut faces from the curved shell for crisp ceramic edges.
    const offset = positions.length / 3;
    for (const vertex of [a, b, a + layerSize, b + layerSize]) {
      positions.push(...positions.slice(vertex * 3, vertex * 3 + 3));
      uvs.push(...uvs.slice(vertex * 2, vertex * 2 + 2));
    }
    indices.push(offset, offset + 1, offset + 2, offset + 1, offset + 3, offset + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices); geo.computeVertexNormals(); return geo;
}

export function taperedBranchGeometry(points, baseRadius, tipRadius, segments = 16) {
  const curve = new THREE.CatmullRomCurve3(points);
  const frames = curve.computeFrenetFrames(segments, false);
  const positions = [], uvs = [], indices = [];
  const sides = baseRadius >= .1 ? 10 : baseRadius >= .025 ? 8 : 5;
  const length = curve.getLength();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments, center = curve.getPointAt(t);
    const collar = baseRadius >= .025 && baseRadius > tipRadius ? baseRadius * .22 * Math.exp(-t * length / Math.max(baseRadius * 1.8, .08)) : 0;
    const radius = tipRadius + (baseRadius - tipRadius) * (1 - t) ** .86 + collar;
    for (let j = 0; j <= sides; j++) {
      const angle = j / sides * Math.PI * 2;
      const offset = frames.normals[i].clone().multiplyScalar(Math.cos(angle)).addScaledVector(frames.binormals[i], Math.sin(angle));
      const corrugation = 1 + Math.sin(angle * 3 + t * 13) * .048 + Math.sin(angle * 5 - t * 8) * .022;
      positions.push(...center.clone().addScaledVector(offset, radius * corrugation).toArray());
      uvs.push(j / sides * Math.max(1, Math.round(baseRadius * Math.PI * 2 / .42)), t * length / .9);
      if (i < segments && j < sides) {
        const a = i * (sides + 1) + j, b = a + sides + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices); geo.computeVertexNormals();
  // UVs need two seam vertices, but bark lighting must remain continuous.
  const normals = geo.attributes.normal;
  for (let i = 0; i <= segments; i++) {
    const a = i * (sides + 1), b = a + sides;
    const normal = new THREE.Vector3().fromBufferAttribute(normals, a).add(new THREE.Vector3().fromBufferAttribute(normals, b)).normalize();
    normals.setXYZ(a, normal.x, normal.y, normal.z); normals.setXYZ(b, normal.x, normal.y, normal.z);
  }
  return geo;
}

export function peachLeafGeometry(variant = 0) {
  const positions = [], uvs = [], indices = [], rows = 8, columns = 2;
  positions.push(0, 0, 0); uvs.push(.5, 0);
  for (let row = 1; row < rows; row++) {
    const t = row / rows, width = Math.sin(Math.PI * t) ** (.85 + variant * .1) * (.038 - variant * .002) * (1 + (row % 2) * .065);
    for (let column = 0; column <= columns; column++) {
      const across = column / columns * 2 - 1;
      positions.push(across * width + Math.sin(t * Math.PI) * variant * .006, t * .26, Math.sin(t * Math.PI) * (.012 - Math.abs(across) * .009) + t * t * .028 + Math.sin(t * Math.PI) * variant * .009);
      uvs.push(column / columns, t);
      if (row < rows - 1 && column < columns) {
        const a = 1 + (row - 1) * (columns + 1) + column, b = a + columns + 1;
        indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }
  const tip = positions.length / 3;
  positions.push(0, .26, .028); uvs.push(.5, 1);
  for (let column = 0; column < columns; column++) {
    indices.push(0, 2 + column, 1 + column);
    const a = 1 + (rows - 2) * (columns + 1) + column;
    indices.push(a, a + 1, tip);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices); geo.computeVertexNormals(); return geo;
}

export function peachLeafTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const pixels = ctx.createImageData(128, 512);
  for (let y = 0; y < 512; y++) for (let x = 0; x < 128; x++) {
    const n = meadowNoise(x * .08 + 3, y * .024), fine = meadowNoise(x * .8, y * .5);
    const edge = Math.abs(x - 64) / 64, age = Math.max(0, n - .57) * 26;
    const i = (y * 128 + x) * 4;
    pixels.data.set([83 + n * 21 + fine * 7 + age - edge * 9, 115 + n * 24 + fine * 7 - edge * 17, 49 + n * 15 + fine * 3 - edge * 5, 255], i);
  }
  ctx.putImageData(pixels, 0, 0);
  for (let x = 0; x < 128; x++) {
    ctx.fillStyle = `rgba(31,58,16,${Math.abs(x - 64) / 64 * .35})`; ctx.fillRect(x, 0, 1, 512);
  }
  ctx.strokeStyle = 'rgba(169,190,115,.72)'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(64, 0); ctx.lineTo(64, 512); ctx.stroke();
  ctx.strokeStyle = 'rgba(154,177,103,.55)'; ctx.lineWidth = .8;
  for (let y = 28; y < 500; y += 31) for (const side of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(64, y); ctx.quadraticCurveTo(64 + side * 30, y + 8, 64 + side * 62, y + 43); ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8; return texture;
}

export function meadowNoise(x, z) {
  const hash = (a, b) => { const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return n - Math.floor(n); };
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), w = fz * fz * (3 - 2 * fz);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix, iz), hash(ix + 1, iz), u), THREE.MathUtils.lerp(hash(ix, iz + 1), hash(ix + 1, iz + 1), u), w);
}

export function meadowTexture() {
  const size = 1024, canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d'), data = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const wx = (x / size - .5) * 64, wz = (y / size - .5) * 64;
    const broad = meadowNoise(wx * .44, wz * .44), medium = meadowNoise(wx * 2.3 + 9, wz * 2.3);
    const fine = meadowNoise(wx * 23, wz * 23), flecks = meadowNoise(wx * 87, wz * 87);
    const dry = THREE.MathUtils.smoothstep(broad, .59, .85), shade = broad * 12 + medium * 17 + fine * 16 + flecks * 8;
    const i = (y * size + x) * 4;
    data.data[i] = 36 + shade + dry * 18;
    data.data[i + 1] = 51 + shade + dry * 8;
    data.data[i + 2] = 22 + shade * .47;
    data.data[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = 8; return texture;
}

export function grassClumpGeometry() {
  const positions = [], colors = [], indices = [], uvs = [];
  const root = new THREE.Color('#35491e'), middle = new THREE.Color('#617f38'), tip = new THREE.Color('#8da45d');
  for (let blade = 0; blade < 6; blade++) {
    const angle = blade * 2.39996, height = .18 + (blade % 4) * .047, bend = .065 + (blade % 3) * .028;
    const width = .009 + (blade % 2) * .003, bx = Math.cos(angle) * .065, bz = Math.sin(angle) * .065, offset = positions.length / 3;
    for (let row = 0; row < 3; row++) {
      const t = row / 2, across = width * (1 - t), curve = bend * t * t;
      const color = t < .5 ? root.clone().lerp(middle, t * 2) : middle.clone().lerp(tip, (t - .5) * 2);
      for (const side of row === 2 ? [0] : [-1, 1]) {
        positions.push(bx + Math.cos(angle) * across * side - Math.sin(angle) * curve, height * t, bz + Math.sin(angle) * across * side + Math.cos(angle) * curve);
        colors.push(color.r, color.g, color.b); uvs.push((side + 1) / 2, t);
      }
      if (row === 0) indices.push(offset, offset + 1, offset + 2, offset + 1, offset + 3, offset + 2);
      if (row === 1) indices.push(offset + 2, offset + 3, offset + 4);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices); geo.computeVertexNormals(); return geo;
}

// Five cupped petals, with a warm throat and rounded tips instead of ellipsoids.
export function peachBlossomGeometry() {
  const positions = [], colors = [], uvs = [], indices = [];
  const throat = new THREE.Color('#e6adb4'), edge = new THREE.Color('#fff4f5');
  for (let petal = 0; petal < 5; petal++) {
    const angle = petal * Math.PI * 2 / 5, offset = positions.length / 3;
    const add = (x, y, z, t) => {
      positions.push(Math.cos(angle) * x + Math.sin(angle) * z, y, -Math.sin(angle) * x + Math.cos(angle) * z);
      uvs.push(x / .064 + .5, z / .082);
      const color = throat.clone().lerp(edge, t); colors.push(color.r, color.g, color.b);
    };
    add(0, .008, .028, .4);
    for (const radius of [.52, 1]) for (let i = 0; i < 8; i++) {
      const theta = i / 8 * Math.PI * 2;
      const z = .028 + Math.cos(theta) * .039 * radius;
      const x = Math.sin(theta) * .029 * radius * (.9 + .1 * Math.cos(theta));
      const notch = Math.max(0, Math.cos(theta)) ** 12 * .003 * radius;
      add(x, .008 + radius * radius * .010 + z * .05, z - notch, THREE.MathUtils.clamp(z / .070, 0, 1));
    }
    for (let i = 0; i < 8; i++) {
      const next = (i + 1) % 8;
      indices.push(offset, offset + 1 + i, offset + 1 + next);
      indices.push(offset + 1 + i, offset + 9 + i, offset + 1 + next, offset + 1 + next, offset + 9 + i, offset + 9 + next);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}
