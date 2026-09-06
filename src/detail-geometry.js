import * as THREE from 'three';

export function clayTileGeometry(pan = false) {
  const positions = [], uvs = [], indices = [];
  const nx = 10, nz = 3, layerSize = (nx + 1) * (nz + 1);
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
    indices.push(a, b, a + layerSize, b, b + layerSize, a + layerSize);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices); geo.computeVertexNormals(); return geo;
}

export function taperedBranchGeometry(points, baseRadius, tipRadius, segments = 16) {
  const curve = new THREE.CatmullRomCurve3(points);
  const frames = curve.computeFrenetFrames(segments, false);
  const positions = [], uvs = [], indices = [], sides = 9;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments, center = curve.getPointAt(t);
    const radius = tipRadius + (baseRadius - tipRadius) * (1 - t) ** .86;
    for (let j = 0; j <= sides; j++) {
      const angle = j / sides * Math.PI * 2;
      const offset = frames.normals[i].clone().multiplyScalar(Math.cos(angle)).addScaledVector(frames.binormals[i], Math.sin(angle));
      const corrugation = 1 + Math.sin(j * 2.8 + t * 13) * .055;
      positions.push(...center.clone().addScaledVector(offset, radius * corrugation).toArray());
      uvs.push(j / sides, t * curve.getLength() / Math.max(baseRadius * 8, .1));
      if (i < segments && j < sides) {
        const a = i * (sides + 1) + j, b = a + sides + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices); geo.computeVertexNormals(); return geo;
}

export function peachLeafGeometry() {
  const positions = [], uvs = [], indices = [], rows = 12, columns = 4;
  for (let row = 0; row <= rows; row++) {
    const t = row / rows, width = Math.sin(Math.PI * t) ** .85 * .038 * (1 + (row % 2) * .045);
    for (let column = 0; column <= columns; column++) {
      const across = column / columns * 2 - 1;
      positions.push(across * width, t * .26, Math.sin(t * Math.PI) * .012 - Math.abs(across) * .009 + t * t * .028);
      uvs.push(column / columns, t);
      if (row < rows && column < columns) {
        const a = row * (columns + 1) + column, b = a + columns + 1;
        indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices); geo.computeVertexNormals(); return geo;
}

export function peachLeafTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#73934c'; ctx.fillRect(0, 0, 128, 512);
  for (let x = 0; x < 128; x++) {
    ctx.fillStyle = `rgba(31,58,16,${Math.abs(x - 64) / 64 * .35})`; ctx.fillRect(x, 0, 1, 512);
  }
  ctx.strokeStyle = '#aec27b'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(64, 0); ctx.lineTo(64, 512); ctx.stroke();
  ctx.strokeStyle = '#92a964'; ctx.lineWidth = 1;
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
    for (let row = 0; row < 4; row++) {
      const t = row / 3, across = width * (1 - t * .94), curve = bend * t * t;
      const color = t < .5 ? root.clone().lerp(middle, t * 2) : middle.clone().lerp(tip, (t - .5) * 2);
      for (const side of [-1, 1]) {
        positions.push(bx + Math.cos(angle) * across * side - Math.sin(angle) * curve, height * t, bz + Math.sin(angle) * across * side + Math.cos(angle) * curve);
        colors.push(color.r, color.g, color.b); uvs.push((side + 1) / 2, t);
      }
      if (row < 3) { const a = offset + row * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices); geo.computeVertexNormals(); return geo;
}
