import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { createWaterSnapshot } from './scene-context.js';
import { modelMetrics } from './model-optimization.js';
import { clothWave } from './cloth.js';

function floatAttribute(source) {
  const values = new Float32Array(source.count * source.itemSize);
  for (let i = 0; i < source.count; i++) for (let j = 0; j < source.itemSize; j++) values[i * source.itemSize + j] = source[['getX', 'getY', 'getZ', 'getW'][j]](i);
  return new THREE.BufferAttribute(values, source.itemSize);
}

export function snapshotGeometry(source, time = 0, needsUV = true) {
  const geometry = new THREE.BufferGeometry();
  // Read via accessors: Float16 UV bit patterns are not glTF UNSIGNED_SHORT UVs.
  for (const name of ['position', 'normal', 'uv', 'color']) {
    if (name === 'uv' && !needsUV) continue;
    const attribute = source.attributes[name];
    if (attribute) geometry.setAttribute(name, name === 'color' ? attribute.clone() : floatAttribute(attribute));
  }
  const uv = geometry.attributes.uv;
  if (uv && uv.array.every(value => value >= 0 && value <= 1)) {
    const packed = new THREE.Uint16BufferAttribute(new Uint16Array(uv.count * 2), 2, true);
    for (let i = 0; i < uv.count; i++) packed.setXY(i, uv.getX(i), uv.getY(i));
    geometry.setAttribute('uv', packed);
  }
  geometry.setIndex(source.index?.clone() ?? null);
  source.groups.forEach(group => geometry.addGroup(group.start, group.count, group.materialIndex));
  const phase = source.attributes.clothPhase;
  if (phase) {
    const { position, normal } = geometry.attributes, n = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      const wave = clothWave(position.getY(i),time,phase.getX(i));
      position.setZ(i, position.getZ(i) + wave.offset);
      n.fromBufferAttribute(normal, i); n.y -= n.z * wave.slope; n.normalize();
      normal.setXYZ(i, n.x, n.y, n.z);
    }
  }
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

// Synchronous capture owns all mutable data before export yields to animation/UI.
export function captureScene(root, context = {}) {
  const { time = 0, theme = 'sunset', waterTime = time, camera, objects = [], normalMap, includeContext = true, exposure = 1.04 } = context;
  root.updateMatrixWorld(true);
  const scene = new THREE.Scene(); scene.name = '长衣亭·当前场景';
  const materialCache = new Map(), geometryCache = new Map();
  function copy(object) {
    if (!object.visible) return null;
    const target = object.clone(false);
    if (object.isDirectionalLight || object.isSpotLight) {
      object.updateMatrixWorld(true); object.target.updateMatrixWorld(true);
      target.lookAt(object.target.getWorldPosition(new THREE.Vector3()));
      target.target = new THREE.Object3D(); target.target.position.set(0, 0, -1); target.add(target.target);
    }
    // clone() copies userData, transforms and instance buffers, but shares geometry/material.
    if (object.isMesh || object.isPoints) {
      const needsUV = Object.values(object.material).some(value => value?.isTexture && !value.isCubeTexture);
      const key = `${object.geometry.uuid}:${needsUV}`;
      if (!geometryCache.has(key)) geometryCache.set(key, snapshotGeometry(object.geometry, time, needsUV));
      target.geometry = geometryCache.get(key);
      if (!materialCache.has(object.material)) materialCache.set(object.material, object.material.clone());
      target.material = materialCache.get(object.material);
    }
    for (const child of object.children) { const cloned = copy(child); if (cloned) target.add(cloned); }
    if (target.isGroup && !target.children.length) return null;
    return target;
  }
  const model = copy(root); scene.add(model);
  if (includeContext) {
    const environment = new THREE.Group(); environment.name = '场景环境'; scene.add(environment);
    for (const object of objects) {
      // Hemisphere/ambient lighting, Sky shaders and render targets have no core glTF equivalent.
      if (object.isHemisphereLight || object.isAmbientLight || object.material?.isShaderMaterial) continue;
      const cloned = copy(object); if (cloned) environment.add(cloned);
    }
    environment.add(createWaterSnapshot(waterTime, theme === 'moonlight', normalMap));
  }
  if (camera) {
    const view = camera.clone(); view.name = '当前视角'; view.clearViewOffset();
    view.userData.websiteViewOffset = camera.view ? { ...camera.view } : null;
    scene.add(view);
  }
  scene.userData = {
    generator: 'Changyi Pavilion 4', time, theme, units: 'metres', exposure,
    modelBounds: new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).toArray(),
    detailCounts: structuredClone(root.userData.detailCounts),
    displayNotes: 'Choose the embedded camera. Water is a static PBR approximation. Procedural sky, fog, hemisphere/IBL lighting, ACES exposure and camera view offset depend on the viewer and are recorded as metadata, not baked into materials.',
    background: theme === 'moonlight' ? '#203c3b' : '#cbd9d2',
  };
  scene.updateMatrixWorld(true);
  return scene;
}

function compatibleMaterial(source, cache) {
  if (!cache.has(source)) {
    const material = source.clone(); material.color.setRGB(1, 1, 1); material.vertexColors = true;
    cache.set(source, material);
  }
  return cache.get(source);
}

// Expand in bounded chunks; core glTF COLOR_0 preserves colours in non-instancing viewers.
export async function expandInstances(scene, { yieldControl = () => Promise.resolve() } = {}) {
  const objects = [], materials = new Map();
  scene.traverse(object => { if (object.isInstancedMesh) objects.push(object); });
  const matrix = new THREE.Matrix4(), normalMatrix = new THREE.Matrix3(), p = new THREE.Vector3(), n = new THREE.Vector3(), tint = new THREE.Color();
  for (const object of objects) {
    const source = object.geometry, attrs = source.attributes, count = attrs.position.count;
    const indices = source.index?.array ?? Uint32Array.from({ length: count }, (_, i) => i);
    const batchSize = Math.max(1, Math.floor(60000 / count));
    const group = new THREE.Group(); group.name = object.name; group.userData = { ...object.userData, expandedInstances: object.count };
    group.position.copy(object.position); group.quaternion.copy(object.quaternion); group.scale.copy(object.scale); group.updateMatrix();
    for (let start = 0; start < object.count; start += batchSize) {
      const total = Math.min(batchSize, object.count - start), vertices = count * total;
      const positions = new Float32Array(vertices * 3), normals = new Float32Array(vertices * 3), colors = new Uint8Array(vertices * 3);
      const packedUV = attrs.uv?.normalized && attrs.uv.array instanceof Uint16Array;
      const uv = attrs.uv ? (packedUV ? new Uint16Array(vertices * 2) : new Float32Array(vertices * 2)) : null;
      const outputIndices = vertices <= 65535 ? new Uint16Array(indices.length * total) : new Uint32Array(indices.length * total);
      for (let instance = 0; instance < total; instance++) {
        object.getMatrixAt(start + instance, matrix); normalMatrix.getNormalMatrix(matrix);
        tint.setRGB(1, 1, 1); if (object.instanceColor) object.getColorAt(start + instance, tint); tint.multiply(object.material.color);
        for (let i = 0; i < count; i++) {
          const at = instance * count + i;
          p.fromBufferAttribute(attrs.position, i).applyMatrix4(matrix); p.toArray(positions, at * 3);
          n.fromBufferAttribute(attrs.normal, i).applyNormalMatrix(normalMatrix); n.toArray(normals, at * 3);
          colors[at * 3] = Math.round(THREE.MathUtils.clamp(tint.r * (attrs.color?.getX(i) ?? 1), 0, 1) * 255);
          colors[at * 3 + 1] = Math.round(THREE.MathUtils.clamp(tint.g * (attrs.color?.getY(i) ?? 1), 0, 1) * 255);
          colors[at * 3 + 2] = Math.round(THREE.MathUtils.clamp(tint.b * (attrs.color?.getZ(i) ?? 1), 0, 1) * 255);
          if (uv) {
            uv[at * 2] = packedUV ? attrs.uv.array[i * 2] : attrs.uv.getX(i);
            uv[at * 2 + 1] = packedUV ? attrs.uv.array[i * 2 + 1] : attrs.uv.getY(i);
          }
        }
        for (let i = 0; i < indices.length; i++) outputIndices[instance * indices.length + i] = indices[i] + instance * count;
      }
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3, true)); if (uv) geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2, packedUV));
      geometry.setIndex(new THREE.BufferAttribute(outputIndices, 1));
      const mesh = new THREE.Mesh(geometry, compatibleMaterial(object.material, materials)); mesh.name = `${object.name}·${start}`;
      mesh.castShadow = object.castShadow; mesh.receiveShadow = object.receiveShadow; group.add(mesh);
      await yieldControl();
    }
    object.parent.add(group); object.removeFromParent();
  }
  scene.updateMatrixWorld(true); return scene;
}

export async function exportScene(snapshot, { profile = 'compact', yieldControl } = {}) {
  if (!['compact', 'compatible'].includes(profile)) throw new Error(`Unknown export profile: ${profile}`);
  if (profile === 'compatible') await expandInstances(snapshot, { yieldControl });
  // Only export carries explicit tangent frames; no extra live GPU buffers are needed.
  const prepared = new Set(), meshes = [], n = new THREE.Vector3(), t = new THREE.Vector3();
  snapshot.traverse(object => { if (object.isMesh && object.material.normalMap) meshes.push(object); });
  for (const object of meshes) {
    if (prepared.has(object.geometry)) continue;
    const geometry = object.geometry; prepared.add(geometry); geometry.computeTangents();
    const tangent = geometry.attributes.tangent, normal = geometry.attributes.normal;
    for (let i = 0; i < tangent.count; i++) {
      n.fromBufferAttribute(normal,i).normalize(); t.fromBufferAttribute(tangent,i);
      if (t.lengthSq() < 1e-12) {
        t.set(...(Math.abs(n.y) < .9 ? [0,1,0] : [1,0,0])); t.addScaledVector(n,-t.dot(n)).normalize();
      } else t.addScaledVector(n,-t.dot(n)).normalize();
      tangent.setXYZW(i,t.x,t.y,t.z,tangent.getW(i) < 0 ? -1 : 1);
    }
    await yieldControl?.();
  }
  snapshot.userData.exportProfile = profile;
  snapshot.userData.exportMetrics = modelMetrics(snapshot);
  return new GLTFExporter().parseAsync(snapshot, { binary: true, onlyVisible: true, maxTextureSize: 1024 });
}
