import * as THREE from 'three';

// Standard tangent-space normal maps are shared by the web model and glTF export.
// Keep them small; the full-resolution colour textures retain the fine surface grain.
export function standardizeSurfaceMaterials(root) {
  const materials = new Set(), cache = new Map();
  root.traverse(object => { if (object.isMesh) materials.add(object.material); });
  for (const material of materials) {
    if (!material.bumpMap) continue;
    const source = material.bumpMap;
    if (!cache.has(source)) {
      const image = source.image, scale = Math.min(1, 256 / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext('2d'); context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height), output = context.createImageData(canvas.width, canvas.height);
      const sample = (x, y) => pixels.data[(((y + canvas.height) % canvas.height) * canvas.width + (x + canvas.width) % canvas.width) * 4] / 255;
      for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
        const nx = (sample(x - 1, y) - sample(x + 1, y)) * 2;
        const ny = (sample(x, y + 1) - sample(x, y - 1)) * 2;
        const length = Math.hypot(nx, ny, 1), offset = (y * canvas.width + x) * 4;
        output.data.set([Math.round((nx / length * .5 + .5) * 255), Math.round((ny / length * .5 + .5) * 255), Math.round((.5 / length + .5) * 255), 255], offset);
      }
      context.putImageData(output, 0, 0);
      const normal = new THREE.CanvasTexture(canvas); normal.wrapS = source.wrapS; normal.wrapT = source.wrapT;
      normal.flipY = source.flipY; normal.repeat.copy(source.repeat); normal.offset.copy(source.offset); normal.rotation = source.rotation; normal.anisotropy = source.anisotropy;
      normal.name = `${source.name || 'surface'}-normal`; cache.set(source, normal);
    }
    material.normalMap = cache.get(source); material.normalScale.setScalar(material.bumpScale * 16);
    material.bumpMap = null; material.bumpScale = 1;
  }
}
