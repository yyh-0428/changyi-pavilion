import * as THREE from 'three';
import { createLakebed } from './lake.js';
import { applyLighting, lightingPreset } from './lighting.js';

// The website and exported scene use exactly the same terrain.
export function createTerrain() {
  const geometry = new THREE.PlaneGeometry(290, 290, 120, 120); geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position, colors = [];
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i), r = Math.hypot(x, z);
    const growth = THREE.MathUtils.smoothstep(r, 55, 100);
    const noise = Math.sin(x * .052 + Math.sin(z * .027) * 2) * 4 + Math.sin(z * .061 + x * .017) * 3 + Math.sin(x * .17 - z * .071) * 1.6;
    positions.setY(i, -5.2 + growth * (7.4 + noise * .66));
    const color = new THREE.Color().setHSL(.30 + growth * .03, .12, .27 + growth * .12 + noise * .008);
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.computeVertexNormals();
  const terrain = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  terrain.name = '远岸地形'; terrain.receiveShadow = true; return terrain;
}

export function createWaterSnapshot(time = 0, night = false, normalMap) {
  const geometry = new THREE.PlaneGeometry(240, 240, 192, 192); geometry.rotateX(-Math.PI / 2);
  const { position, normal, uv } = geometry.attributes;
  const n = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), z = position.getZ(i);
    const a = x * .83 + z * .37 - time * .77, b = x * -.49 + z * 1.17 - time * .95;
    position.setY(i, -.15 + Math.sin(a) * .014 + Math.sin(b) * .008);
    n.set(-Math.cos(a) * .83 * .014 + Math.cos(b) * .49 * .008, 1, -Math.cos(a) * .37 * .014 - Math.cos(b) * 1.17 * .008).normalize();
    normal.setXYZ(i, n.x, n.y, n.z);
    uv.setXY(i, x * .16 + time * .008, z * .16 + time * .003);
  }
  const material = new THREE.MeshPhysicalMaterial({ name: '清波·静态水面近似', color: night ? '#254744' : '#54827b', roughness: .18, metalness: 0, ior: 1.333, normalMap: normalMap ?? null, normalScale: new THREE.Vector2(.115, .115) });
  const water = new THREE.Mesh(geometry, material); water.name = '清波·导出快照';
  water.userData.approximation = 'Static PBR surface; realtime reflection, refraction and depth absorption require the website renderer.';
  return water;
}

// The command-line export starts at the same overview and evening lighting as the website.
export function createExportContext(model, { time = 0, theme = 'sunset', normalMap } = {}) {
  const preset = lightingPreset(theme);
  const camera = new THREE.PerspectiveCamera(39, 16 / 9, .1, 800);
  camera.position.set(19, 16, 32); camera.lookAt(.2, 1.7, 5.4);
  const sun = new THREE.DirectionalLight(); sun.name = '主光';
  const fill = new THREE.DirectionalLight(); fill.name = '补光';
  const lamps = model.lightPositions.map((position, i) => {
    const light = new THREE.PointLight('#ffbd70', preset.lampIntensity, 5.5, 2); light.position.copy(position); light.name = `灯光·${i + 1}`; return light;
  });
  applyLighting(theme, { sun, fill, lamps, lanternMaterial: model.lanternMaterial });
  return { camera, objects: [createTerrain(), createLakebed(), sun, fill, ...lamps], time, waterTime: time, theme, normalMap, exposure: preset.exposure };
}
