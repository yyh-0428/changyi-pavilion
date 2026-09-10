import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { installCanvas, loadMaterialImages } from '../scripts/node-canvas.mjs';
import { createArchitecturalSurfaces } from '../src/surface-materials.js';
import { beveledBoxGeometry } from '../src/architecture-geometry.js';
import { applyLighting, lightingPreset, MOON_POSITION } from '../src/lighting.js';
import { createExportContext } from '../src/scene-context.js';
import { captureScene, exportScene } from '../src/export-scene.js';

installCanvas();
const surfaceImages = await loadMaterialImages();
const surfaces = createArchitecturalSurfaces(surfaceImages);
const pixels = texture => texture.image.getContext('2d').getImageData(0, 0, texture.image.width, texture.image.height).data;

test('physical surface maps stay within texture budget and carry valid colour and normal data', () => {
  let bytes = 0;
  for (const [name, surface] of Object.entries(surfaces)) {
    assert.equal(surface.map.colorSpace, THREE.SRGBColorSpace, name);
    for (const [slot, texture] of Object.entries(surface)) {
      bytes += texture.image.width * texture.image.height * 4;
      assert.equal(texture.wrapS, THREE.RepeatWrapping);
      if (slot !== 'map') assert.equal(texture.colorSpace, THREE.NoColorSpace, `${name}/${slot}`);
    }
    if (surface.normalMap) {
      const data = pixels(surface.normalMap);
      let nonFlat = 0;
      for (let i = 0; i < data.length; i += 4) {
        const x = data[i] / 127.5 - 1, y = data[i + 1] / 127.5 - 1, z = data[i + 2] / 127.5 - 1;
        assert.ok(Math.abs(Math.hypot(x, y, z) - 1) < .014 && z > .65, name);
        if (Math.abs(x) + Math.abs(y) > .02) nonFlat++;
      }
      assert.ok(nonFlat > 100, `${name} has physical relief`);
    }
    if (surface.roughnessMap) {
      const values = pixels(surface.roughnessMap).filter((_, i) => i % 4 === 1);
      const low = values.reduce((a, b) => Math.min(a, b), 255), high = values.reduce((a, b) => Math.max(a, b), 0);
      assert.ok(low >= 150 && high <= 255, name);
      assert.ok(high - low >= 18, `${name} has spatial roughness`);
    }
  }
  // V6 deliberately spends texture memory on four 512² PBR families plus
  // independent plaster and sawn ends. Keep the full scene below 28 MiB with mips.
  assert.ok(bytes <= 14 * 1048576, 'eight surface families remain within the V6 texture budget');
  assert.notDeepEqual(pixels(surfaces.bark.map), pixels(surfaces.wood.map));
  assert.deepEqual(surfaces.linen.map.repeat, surfaces.linen.normalMap.repeat);
  const again = createArchitecturalSurfaces(surfaceImages);
  const digest = texture => createHash('sha256').update(pixels(texture)).digest('hex');
  for (const [name, surface] of Object.entries(surfaces)) for (const slot of Object.keys(surface)) assert.equal(digest(surface[slot]), digest(again[name][slot]));
  for (const name of ['wood', 'bark', 'tile']) {
    const map = surfaces[name].map, data = pixels(map), width = map.image.width;
    assert.equal(map.userData.source, `authored-${name}-v6`);
    for (let k = 0; k < width; k++) for (let c = 0; c < 3; c++) {
      assert.equal(data[(k * width) * 4 + c], data[(k * width + width - 1) * 4 + c], `${name} horizontal repeat seam`);
      assert.equal(data[k * 4 + c], data[((width - 1) * width + k) * 4 + c], `${name} vertical repeat seam`);
    }
  }
});

test('millimetre chamfers have closed outward faces, keep dimensions and remove sharp corners', () => {
  for (const dimensions of [[2.25, .18, .58, .006], [.105, .13, 1, .003]]) {
    const geometry = beveledBoxGeometry(...dimensions), p = geometry.attributes.position, edges = new Map();
    const id = index => [p.getX(index), p.getY(index), p.getZ(index)].map(value => value.toFixed(6)).join(',');
    let volume = 0;
    for (let i = 0; i < geometry.index.count; i += 3) {
      const ids = [0, 1, 2].map(j => geometry.index.getX(i + j));
      const [a, b, c] = ids.map(index => new THREE.Vector3().fromBufferAttribute(p, index));
      const cross = b.clone().sub(a).cross(c.clone().sub(a));
      assert.ok(cross.lengthSq() > 1e-14);
      assert.ok(cross.dot(a.clone().add(b).add(c)) > 0);
      volume += a.dot(b.clone().cross(c)) / 6;
      for (let j = 0; j < 3; j++) {
        const from = id(ids[j]), to = id(ids[(j + 1) % 3]), key = [from, to].sort().join('|');
        const edge = edges.get(key) ?? { count: 0, direction: 0 };
        edge.count++; edge.direction += from < to ? 1 : -1; edges.set(key, edge);
      }
    }
    for (const edge of edges.values()) assert.deepEqual(edge, { count: 2, direction: 0 });
    geometry.computeBoundingBox();
    assert.ok(geometry.boundingBox.getSize(new THREE.Vector3()).distanceTo(new THREE.Vector3(...dimensions)) < 1e-6);
    const boxVolume = dimensions[0] * dimensions[1] * dimensions[2];
    assert.ok(volume > boxVolume * .99 && volume < boxVolume);
    const corner = new THREE.Vector3(dimensions[0], dimensions[1], dimensions[2]).multiplyScalar(.5);
    for (let i = 0; i < p.count; i++) assert.ok(new THREE.Vector3().fromBufferAttribute(p, i).distanceTo(corner) > dimensions[3] * .9);
  }
});

test('website and CLI share both lighting presets, including lantern emission and lunar direction', () => {
  const lanternMaterial = new THREE.MeshStandardMaterial(), model = { lanternMaterial, lightPositions: [new THREE.Vector3(1, 2, 3)] };
  for (const theme of ['sunset', 'moonlight']) {
    const context = createExportContext(model, { theme }), sun = new THREE.DirectionalLight(), fill = new THREE.DirectionalLight();
    const lamps = [new THREE.PointLight()], hemisphere = new THREE.HemisphereLight();
    const scene = new THREE.Scene(); scene.background = new THREE.Color(); scene.fog = new THREE.FogExp2();
    const renderer = {};
    applyLighting(theme, { sun, fill, lamps, hemisphere, scene, renderer });
    const exported = context.objects.filter(object => object.isLight);
    for (const [web, cli] of [[sun, exported[0]], [fill, exported[1]], [lamps[0], exported[2]]]) {
      assert.equal(web.intensity, cli.intensity);
      if (!web.isPointLight) { assert.ok(web.color.equals(cli.color)); assert.ok(web.position.equals(cli.position)); }
    }
    assert.equal(model.lanternMaterial.emissiveIntensity, lightingPreset(theme).lanternEmission);
    assert.equal(renderer.toneMappingExposure, context.exposure);
    assert.equal(scene.environmentIntensity, lightingPreset(theme).environment);
    if (theme === 'moonlight') assert.ok(sun.position.clone().normalize().distanceTo(new THREE.Vector3(...MOON_POSITION).normalize()) < 1e-8);
  }
});

test('both GLB profiles retain surface maps, sheen weave transforms and emission without baking light into albedo', async () => {
  const root = new THREE.Group(); root.userData.detailCounts = {};
  root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ name: 'stone', ...surfaces.stone, roughness: 1 })));
  root.add(new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshPhysicalMaterial({ name: 'linen', ...surfaces.linen, sheen: .7 })));
  root.add(new THREE.Mesh(new THREE.SphereGeometry(.2, 8, 6), new THREE.MeshStandardMaterial({ name: 'paper', ...surfaces.paper, emissiveMap: surfaces.paper.map, emissive: '#ffbf70', emissiveIntensity: 2 })));
  for (const profile of ['compact', 'compatible']) {
    const binary = await exportScene(captureScene(root, { includeContext: false }), { profile });
    const view = new DataView(binary), json = JSON.parse(new TextDecoder().decode(new Uint8Array(binary, 20, view.getUint32(12, true))));
    const stone = json.materials.find(material => material.name === 'stone');
    assert.ok(stone.normalTexture && stone.pbrMetallicRoughness.metallicRoughnessTexture);
    assert.equal(stone.pbrMetallicRoughness.metallicFactor, 0);
    const linen = json.materials.find(material => material.name === 'linen');
    assert.deepEqual(linen.pbrMetallicRoughness.baseColorTexture.extensions.KHR_texture_transform.scale, [8, 24]);
    assert.deepEqual(linen.normalTexture.extensions.KHR_texture_transform.scale, [8, 24]);
    assert.ok(linen.extensions.KHR_materials_sheen);
    const paper = json.materials.find(material => material.name === 'paper');
    assert.ok(paper.emissiveTexture && paper.extensions.KHR_materials_emissive_strength);
  }
});
