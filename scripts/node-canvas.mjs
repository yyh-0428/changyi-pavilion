import { createCanvas, CanvasElement, Image, ImageData, loadImage } from '@napi-rs/canvas';
import * as THREE from 'three';

// Build/export uses a real raster canvas; this adapter is never bundled into the website.
export function installCanvas() {
  globalThis.HTMLCanvasElement = CanvasElement;
  globalThis.HTMLImageElement = Image;
  globalThis.ImageData = ImageData;
  globalThis.document = {
    createElement(tag) {
      if (tag !== 'canvas') throw new Error(`Unsupported offscreen element: ${tag}`);
      const canvas = createCanvas(1, 1);
      canvas.toBlob = (callback, type = 'image/png') => callback(new Blob([canvas.toBuffer(type)], { type }));
      return canvas;
    },
  };
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.(); }).catch(error => this.onerror?.(error)); }
    readAsDataURL(blob) { blob.arrayBuffer().then(result => { this.result = `data:${blob.type};base64,${Buffer.from(result).toString('base64')}`; this.onloadend?.(); }).catch(error => this.onerror?.(error)); }
  };
}

export async function loadPlaqueMap() {
  const image = await loadImage(new URL('../public/textures/plaque-atlas.png', import.meta.url));
  const texture = new THREE.Texture(image);
  texture.flipY = false; texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8; texture.needsUpdate = true;
  return texture;
}
