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

function barkCells(u, v) {
  const nx = 14, ny = 11, x = u * nx, y = v * ny, ix = Math.floor(x), iy = Math.floor(y);
  let nearest = Infinity, second = Infinity, tone = .5;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const cx = ix + dx, cy = iy + dy, px = (cx % nx + nx) % nx, py = (cy % ny + ny) % ny;
    const a = hash(px, py, 8162), b = hash(px, py, 6321);
    const distance = Math.hypot(cx + .1 + a * .8 - x, cy + .1 + b * .8 - y);
    if (distance < nearest) { second = nearest; nearest = distance; tone = a; }
    else if (distance < second) second = distance;
  }
  return { gap: second - nearest, tone };
}

function field(kind, u, v) {
  const seed = { wood: 0, bark: 117, stone: 529, tile: 911, plaster: 380, endgrain: 771, linen: 0, paper: 0 }[kind];
  const broad = noise(u, v, 5, 5, 71 + seed), fine = noise(u, v, 96, 96, 109 + seed);
  if (kind === 'wood') {
    const du = Math.sin((u - .34) * Math.PI), dv = Math.sin((v - .58) * Math.PI);
    const knot = Math.exp(-(du * du * 54 + dv * dv * 21));
    const warp = noise(u, v, 8, 3, 512) * 4 + knot * 8;
    const grain = Math.pow(.5 + .5 * Math.sin(u * TAU * 41 + warp), 12);
    const pores = Math.pow(noise(u, v, 151, 16, 219), 4);
    const weather = noise(u, v, 14, 3, 92), fibres = noise(u, v, 230, 29, 201);
    const check = Math.pow(noise(u, v, 76, 4, 721), 18);
    const color = .72 + weather * .17 + broad * .055 - grain * .12 - pores * .20 - knot * .14 - check * .34;
    return { color: [color * 1.028, color, color * .955], height: .51 - grain * .10 - pores * .22 - check * .65 + fibres * .022, roughness: .61 + weather * .22 + pores * .16 + check * .18 };
  }
  if (kind === 'bark') {
    const cells = barkCells(u + noise(u, v, 19, 23, 413) * .035, v + noise(u, v, 27, 13, 829) * .027);
    const furrow = Math.exp(-cells.gap * 34) * (.48 + noise(u, v, 32, 41, 339) * .52);
    const plates = noise(u, v, 22, 43, 631), fissure = Math.pow(1 - plates, 6);
    const lenticel = Math.pow(noise(u, v, 18, 155, 172), 13);
    const lichen = clamp((noise(u, v, 27, 32, 901) - .69) * 5) * clamp((broad - .43) * 3);
    const color = .60 + plates * .13 + broad * .09 + cells.tone * .12 - furrow * .23 - fissure * .22 + lenticel * .32;
    return { color: [color * .98 + lichen * .09, color + lichen * .13, color * .947 + lichen * .10], height: .48 + plates * .10 + fine * .045 - furrow * .35 - fissure * .25 + lenticel * .12, roughness: .80 + plates * .16 + furrow * .1 };
  }
  if (kind === 'stone') {
    const mineral = noise(u, v, 26, 31, 308), grains = noise(u, v, 235, 221, 552);
    const pit = Math.pow(1 - fine, 5), quartz = clamp((grains - .76) * 5);
    const cleft = Math.pow(.5 + .5 * Math.sin((u * 3 + v * 2) * TAU + broad * 8), 34) * .12;
    const color = .63 + broad * .16 + mineral * .16 + grains * .065 - pit * .34 - cleft * .30;
    return { color: [color * 1.009 + quartz * .04, color + quartz * .04, color * .975 + quartz * .035], height: .40 + mineral * .15 + fine * .12 + grains * .045 - pit * .38 - cleft, roughness: .72 + mineral * .19 + pit * .20 - quartz * .09 };
  }
  if (kind === 'tile') {
    const ceramicGrain = noise(u, v, 167, 155, 723);
    const kiln = noise(u, v, 9, 8, 816), pit = Math.pow(1 - ceramicGrain, 7);
    const soot = noise(u, v, 3, 7, 816), mineral = noise(u, v, 196, 212, 627);
    const rolled = Math.sin((v * 38 + Math.sin(u * TAU) * .16) * TAU);
    const bloom = clamp((noise(u, v, 24, 19, 71) - .66) * 3) * kiln;
    const color = .64 + broad * .12 + kiln * .18 - soot * .10 - pit * .29 + bloom * .17;
    return { color: [color * .968 + kiln * .015, color, color * 1.013 - kiln * .026], height: .49 + ceramicGrain * .065 + mineral * .025 - pit * .30 + rolled * .016, roughness: .64 + kiln * .20 + pit * .22 + bloom * .12 };
  }
  if (kind === 'plaster') {
    const trowel = noise(u, v, 11, 6, 105), sand = noise(u, v, 206, 198, 402);
    const pores = Math.pow(1 - fine, 6), color = .83 + broad * .06 + trowel * .055 + sand * .025 - pores * .15;
    return { color: [color, color * .997, color * .975], height: .5 + trowel * .025 + sand * .045 - pores * .16, roughness: .82 + trowel * .14 };
  }
  if (kind === 'endgrain') {
    // A sawn end has annual rings instead of longitudinal fibres.
    const x = u - .46, y = v - .53, a = Math.atan2(y, x);
    const radius = Math.hypot(x, y) + Math.sin(a * 3) * .005;
    const rings = Math.pow(.5 + .5 * Math.sin(radius * 190 + broad * 2), 7);
    const checks = Math.pow(.5 + .5 * Math.cos(a * 9 + Math.sin(radius * 13)), 70) * clamp((radius - .12) * 2);
    const color = .78 + broad * .10 - rings * .16 - checks * .28;
    return { color: [color * 1.018, color, color * .93], height: .5 - rings * .08 - checks * .3 + fine * .025, roughness: .75 + rings * .15 + checks * .1 };
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

function imageField(source, size) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d'); ctx.drawImage(source, 0, 0, size, size);
  const pixels = ctx.getImageData(0, 0, size, size).data;
  // Blend only a narrow border so repeated photographic grain cannot leave a
  // hard seam. Original source assets stay intact and export receives this map.
  const border = Math.max(8, Math.round(size * .025));
  for (let axis = 0; axis < 2; axis++) for (let edge = 0; edge < border; edge++) {
    const t = edge / border, weight = .5 * (1 - t * t * (3 - 2 * t));
    for (let k = 0; k < size; k++) {
      const a = (axis ? edge * size + k : k * size + edge) * 4;
      const b = (axis ? (size - 1 - edge) * size + k : k * size + size - 1 - edge) * 4;
      for (let c = 0; c < 3; c++) {
        const av = pixels[a + c], bv = pixels[b + c];
        pixels[a + c] = mix(av, bv, weight); pixels[b + c] = mix(bv, av, weight);
      }
    }
  }
  const means = [0, 0, 0], luminance = new Float32Array(size * size);
  for (let i = 0; i < luminance.length; i++) {
    for (let c = 0; c < 3; c++) means[c] += pixels[i * 4 + c];
    luminance[i] = (pixels[i * 4] * .2126 + pixels[i * 4 + 1] * .7152 + pixels[i * 4 + 2] * .0722) / 255;
  }
  for (let c = 0; c < 3; c++) means[c] = Math.max(1, means[c] / luminance.length);
  // Remove broad colour variation from the relief signal. A kiln cloud must
  // not become a lump. This is microrelief, not photogrammetric displacement.
  const horizontal = new Float32Array(luminance.length), low = new Float32Array(luminance.length), radius = 5, taps = 11;
  for (let y = 0; y < size; y++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += luminance[y * size + (k + size) % size];
    for (let x = 0; x < size; x++) {
      horizontal[y * size + x] = sum / taps;
      sum += luminance[y * size + (x + radius + 1) % size] - luminance[y * size + (x - radius + size) % size];
    }
  }
  for (let x = 0; x < size; x++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += horizontal[((k + size) % size) * size + x];
    for (let y = 0; y < size; y++) {
      low[y * size + x] = sum / taps;
      sum += horizontal[((y + radius + 1) % size) * size + x] - horizontal[((y - radius + size) % size) * size + x];
    }
  }
  return { pixels, means, luminance, low };
}

export function createSurface(kind, sourceImage) {
  const size = kind === 'linen' || kind === 'paper' ? 128 : kind === 'plaster' || kind === 'endgrain' ? 256 : 512;
  const colors = new Uint8ClampedArray(size * size * 4), heights = new Float32Array(size * size);
  const roughness = new Uint8ClampedArray(size * size * 4);
  const source = sourceImage ? imageField(sourceImage, size) : null;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x, data = field(kind, x / size, y / size);
    if (source) {
      // Keep the model's selected wood/clay/bark palette; image grain contributes
      // natural within-material colour variation without multiplying two tints.
      data.color = [0, 1, 2].map(c => source.pixels[i * 4 + c] / source.means[c] * .77);
      const relief = source.luminance[i] - source.low[i];
      const depth = kind === 'bark' ? .72 : kind === 'wood' ? .42 : .32;
      data.height = .5 + relief * depth + (data.height - .5) * .12;
      data.roughness = clamp(data.roughness * .48 + (.77 - relief * .22) * .52, .60, .98);
    }
    for (let c = 0; c < 3; c++) colors[i * 4 + c] = clamp(data.color[c]) * 255;
    colors[i * 4 + 3] = 255; heights[i] = data.height;
    // glTF roughness uses G; unused R/B stay white for lossless channel packing.
    roughness.set([255, Math.round(clamp(data.roughness) * 255), 255, 255], i * 4);
  }
  const map = textureFromPixels(`${kind}-albedo`, size, colors, true);
  if (source) map.userData.source = `authored-${kind}-v6`;
  if (kind === 'paper') return { map };
  const normals = new Uint8ClampedArray(size * size * 4);
  const sample = (x, y) => heights[((y + size) % size) * size + (x + size) % size];
  const strength = kind === 'bark' ? 4.5 : kind === 'linen' ? .8 : kind === 'plaster' ? 2 : 3.2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const nx = clamp((sample(x - 1, y) - sample(x + 1, y)) * strength, -.65, .65);
    const ny = clamp((sample(x, y + 1) - sample(x, y - 1)) * strength, -.65, .65);
    const length = Math.hypot(nx, ny, 1);
    normals.set([Math.round((nx / length * .5 + .5) * 255), Math.round((ny / length * .5 + .5) * 255), Math.round((.5 / length + .5) * 255), 255], (y * size + x) * 4);
  }
  const normalMap = textureFromPixels(`${kind}-normal`, size, normals);
  if (kind === 'linen') return { map, normalMap };
  const roughnessMap = textureFromPixels(`${kind}-roughness`, size, roughness);
  roughnessMap.userData.gltfMetallicRoughness = true;
  return { map, normalMap, roughnessMap };
}

export function createArchitecturalSurfaces(surfaceImages = {}) {
  const surfaces = Object.fromEntries(['wood', 'bark', 'stone', 'tile', 'plaster', 'endgrain', 'linen', 'paper'].map(kind => [kind, createSurface(kind, surfaceImages[kind])]));
  for (const texture of Object.values(surfaces.linen)) texture.repeat.set(8, 24);
  return surfaces;
}
