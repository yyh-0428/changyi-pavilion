import * as THREE from 'three';

export const SURFACE_ASSETS = {
  wood: 'timber-albedo-v6.png',
  bark: 'peach-bark-albedo-v6.png',
  tile: 'blue-clay-albedo-v6.png',
};

export async function loadSurfaceImages(baseURL, loadImage = url => new THREE.ImageLoader().loadAsync(url)) {
  const entries = await Promise.all(Object.entries(SURFACE_ASSETS).map(async ([kind, filename]) => [kind, await loadImage(`${baseURL}textures/${filename}`)]));
  return Object.fromEntries(entries);
}
