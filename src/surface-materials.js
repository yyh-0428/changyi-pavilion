import * as THREE from 'three';

const TAU = Math.PI * 2;
const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
const mix = THREE.MathUtils.lerp;

// Periodic value noise: colour, physical height and roughness have distinct fields.
// This generator never consumes the garden's placement seed.
function hash(x, y, seed) {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
function noise(u, v, nx, ny, seed) {
  const x = u * nx, y = v * ny, ix = Math.floor(x), iy = Math.floor(y);
  const sx = x - ix, sy = y - iy, fx = sx * sx * (3 - 2 * sx), fy = sy * sy * (3 - 2 * sy);
  const sample = (a, b) => hash((a % nx + nx) % nx, (b % ny + ny) % ny, seed);
  return mix(mix(sample(ix, iy), sample(ix + 1, iy), fx), mix(sample(ix, iy + 1), sample(ix + 1, iy + 1), fx), fy);
}

function field(kind, u, v) {
  const broad = noise(u, v, 5, 5, 71), fine = noise(u, v, 96, 96, 109);
  if (kind === 'wood') {
    const warp = Math.sin(v * TAU) * .7 + Math.sin(v * TAU * 3 + .4) * .2;
    const grain = Math.pow(.5 + .5 * Math.sin(u * TAU * 37 + warp + Math.sin(u * TAU * 5)), 10);
    const pores = Math.pow(noise(u, v, 98, 12, 219), 6);
    const weather = noise(u, v, 12, 3, 92);
    const color = .80 + broad * .065 + weather * .035 - grain * .055 - pores * .14;
    return { color: [color, color * .984, color * .965], height: .53 - grain * .075 - pores * .20 + fine * .018, roughness: .62 + weather * .20 + pores * .10 };
  }
  if (kind === 'bark') {
    const bend = noise(u, v, 7, 3, 413) * 5 + noise(u, v, 16, 8, 829) * 1.6;
    const ridge = Math.pow(.5 + .5 * Math.sin(u * TAU * 11 + bend), .5);
    const cracks = Math.pow(noise(u, v, 48, 9, 631), 4);
    const lenticel = Math.pow(noise(u, v, 16, 86, 172), 9);
    const color = .55 + ridge * .23 + broad * .08 - cracks * .20 + lenticel * .30;
    return { color: [color, color * .98, color * .93], height: ridge * .42 + fine * .08 - cracks * .25 + lenticel * .20, roughness: .86 + fine * .13 };
  }
  if (kind === 'stone') {
    const mineral = noise(u, v, 26, 26, 308), pit = Math.pow(1 - fine, 8);
    const vein = Math.pow(.5 + .5 * Math.sin((u * 3 + v * 2) * TAU + broad * 4), 16);
    const color = .76 + broad * .08 + mineral * .12 - vein * .022 - pit * .20;
    return { color: [color * 1.006, color, color * .974], height: .42 + mineral * .18 + fine * .09 - pit * .28, roughness: .84 + mineral * .12 + pit * .10 };
  }
  if (kind === 'tile') {
    const kiln = noise(u, v, 8, 8, 816), pit = Math.pow(1 - fine, 7);
    const rolled = Math.sin((v * 18 + Math.sin(u * TAU) * .10) * TAU);
    const color = .80 + broad * .06 + kiln * .075 - pit * .20;
    return { color: [color * .989, color, color * .981], height: .50 + fine * .085 - pit * .22 + rolled * .009, roughness: .76 + kiln * .18 + pit * .12 };
  }
  if (kind === 'linen') {
    const warp = Math.sin(u * TAU * 32), weft = Math.sin(v * TAU * 32);
    const weave = warp * weft;
    const color = .965 + weave * .022 + fine * .009;
    return { color: [color, color, color * .994], height: .5 + weave * .055, roughness: 1 };
  }
  if (kind === 'paper') {
    const fibre = noise(u, v, 56, 9, 112), cross = noise(u, v, 13, 68, 731);
    // Rib shadows align with the eight existing physical ribs on the sphere UVs.
    const rib = Math.pow(.5 + .5 * Math.cos(u * TAU * 8), 28);
    const rim = Math.pow(Math.abs(Math.cos(v * Math.PI)), 6);
    const color = .87 + fibre * .09 + cross * .04 - rib * .10 - rim * .09;
    return { color: [color, color * .993, color * .97], height: .5, roughness: 1 };
  }
  throw new Error(`Unknown surface: ${kind}`);
}

function textureFromPixels(name, size, pixels, color = false) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const context = canvas.getContext('2d'), image = context.createImageData(size, size);
  image.data.set(pixels); context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas); texture.name = name;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.anisotropy = 8;
  return texture;
}

export function createSurface(kind) {
  const size = kind === 'linen' || kind === 'paper' ? 128 : 256;
  const colors = new Uint8ClampedArray(size * size * 4), heights = new Float32Array(size * size);
  const roughness = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x, data = field(kind, x / size, y / size);
    for (let c = 0; c < 3; c++) colors[i * 4 + c] = clamp(data.color[c]) * 255;
    colors[i * 4 + 3] = 255; heights[i] = data.height;
    // glTF roughness uses G; unused R/B stay white for lossless channel packing.
    roughness.set([255, Math.round(clamp(data.roughness) * 255), 255, 255], i * 4);
  }
  const map = textureFromPixels(`${kind}-albedo`, size, colors, true);
  if (kind === 'paper') return { map };
  const normals = new Uint8ClampedArray(size * size * 4);
  const sample = (x, y) => heights[((y + size) % size) * size + (x + size) % size];
  const strength = kind === 'bark' ? 2 : kind === 'linen' ? .8 : 1.5;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const nx = (sample(x - 1, y) - sample(x + 1, y)) * strength;
    const ny = (sample(x, y + 1) - sample(x, y - 1)) * strength;
    const length = Math.hypot(nx, ny, 1);
    normals.set([Math.round((nx / length * .5 + .5) * 255), Math.round((ny / length * .5 + .5) * 255), Math.round((.5 / length + .5) * 255), 255], (y * size + x) * 4);
  }
  const normalMap = textureFromPixels(`${kind}-normal`, size, normals);
  if (kind === 'linen') return { map, normalMap };
  const roughnessMap = textureFromPixels(`${kind}-roughness`, size, roughness);
  roughnessMap.userData.gltfMetallicRoughness = true;
  return { map, normalMap, roughnessMap };
}

export function createArchitecturalSurfaces() {
  const surfaces = Object.fromEntries(['wood', 'bark', 'stone', 'tile', 'linen', 'paper'].map(kind => [kind, createSurface(kind)]));
  for (const texture of Object.values(surfaces.linen)) texture.repeat.set(8, 24);
  return surfaces;
}
