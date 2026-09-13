import * as THREE from 'three';

export const SURFACE_ASSETS = {
  wood: 'timber-albedo-v6.png',
  bark: 'peach-bark-albedo-v6.png',
  tile: 'blue-clay-albedo-v6.png',
};

export async function loadSurfaceImages(baseURL, loadImage = url => new THREE.ImageLoader().loadAsync(url)) {
  const entries = await Promise.all(Object.entries(SURFACE_ASSETS).map(async ([kind, filename]) => [kind,
    await optionalAsset(() => loadImage(`${baseURL}textures/${filename}`), () => undefined),
  ]));
  return Object.fromEntries(entries);
}

export async function optionalAsset(load, fallback, timeoutMs = 12000) {
  let timer;
  try {
    return await Promise.race([Promise.resolve().then(load), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Asset load timed out')), timeoutMs);
    })]);
  } catch (error) {
    console.warn('Using local material fallback:', error.message);
    return fallback();
  } finally { clearTimeout(timer); }
}
