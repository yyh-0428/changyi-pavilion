import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// Preserve indexed vertices, material boundaries, culling regions and animated pivots.
export function batchModel(root) {
  root.updateMatrixWorld(true);
  const batches = new Map(), sources = [], sourceGeometries = new Set();
  const inverse = new THREE.Matrix4();
  root.traverse(object => {
    if (!object.isMesh || object.isInstancedMesh || object.userData.deforming) return;
    let parent = object.parent;
    while (parent.parent && parent.parent !== root && !parent.userData.dynamic && !parent.userData.batchRegion) parent = parent.parent;
    const key = `${parent.uuid}:${object.material.uuid}:${object.castShadow}:${object.receiveShadow}`;
    if (!batches.has(key)) batches.set(key, { parent, material: object.material, geometries: [], castShadow: object.castShadow, receiveShadow: object.receiveShadow });
    let geometry = object.geometry.clone();
    for (const name of Object.keys(geometry.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geometry.deleteAttribute(name);
    if (!geometry.attributes.uv) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count * 2), 2));
    if (!geometry.index) {
      const indexed = mergeVertices(geometry, 1e-5); geometry.dispose(); geometry = indexed;
    }
    inverse.copy(parent.matrixWorld).invert();
    geometry.applyMatrix4(inverse.multiply(object.matrixWorld));
    batches.get(key).geometries.push(geometry);
    sources.push(object); sourceGeometries.add(object.geometry);
  });
  for (const object of sources) object.removeFromParent();
  for (const geometry of sourceGeometries) geometry.dispose();
  for (const { parent, material, geometries, castShadow, receiveShadow } of batches.values()) {
    const merged = mergeGeometries(geometries);
    if (!merged) throw new Error(`Cannot batch ${parent.name}: incompatible geometry attributes`);
    const batch = new THREE.Mesh(merged, material);
    batch.name = `${parent.name || '木构'}·${material.name || material.type}`;
    batch.castShadow = castShadow; batch.receiveShadow = receiveShadow;
    merged.computeBoundingBox(); merged.computeBoundingSphere(); parent.add(batch);
    for (const geometry of geometries) geometry.dispose();
  }
  root.traverse(object => {
    if (object.isInstancedMesh) { object.computeBoundingBox(); object.computeBoundingSphere(); }
    object.updateMatrix();
    if (!object.userData.dynamic) object.matrixAutoUpdate = false;
  });
}

export function modelMetrics(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  let meshes = 0, instances = 0, triangles = 0, geometryBytes = 0;
  root.traverse(object => {
    if (!object.isMesh) return;
    meshes++;
    const geometry = object.geometry, count = object.isInstancedMesh ? object.count : 1;
    triangles += (geometry.index?.count ?? geometry.attributes.position.count) / 3 * count;
    if (object.isInstancedMesh) {
      instances += count; geometryBytes += object.instanceMatrix.array.byteLength + (object.instanceColor?.array.byteLength ?? 0);
    }
    if (!geometries.has(geometry)) {
      geometries.add(geometry);
      for (const attribute of Object.values(geometry.attributes)) geometryBytes += attribute.array.byteLength;
      geometryBytes += geometry.index?.array.byteLength ?? 0;
    }
    materials.add(object.material);
    for (const value of Object.values(object.material)) if (value?.isTexture) textures.add(value);
  });
  return { triangles, geometryBytes, meshes, instances, geometries: geometries.size, materials: materials.size, textures: textures.size };
}
