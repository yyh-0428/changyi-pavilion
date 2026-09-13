import * as THREE from 'three';

// Approximate mid-blade width in metres; decisions use actual drawing pixels.
export const MEADOW_BLADE_WIDTH = .014;
export const MEADOW_FADE_PIXELS = [.55, 1.35];

export function meadowCoverage(distance, focalPixels, spread = 1) {
  return THREE.MathUtils.smoothstep(MEADOW_BLADE_WIDTH * spread * focalPixels / Math.max(.001, distance), ...MEADOW_FADE_PIXELS);
}

export function createMeadowMaterial() {
  const material = new THREE.MeshStandardMaterial({ name: '近景草叶', color: '#ffffff', vertexColors: true, roughness: 1, side: THREE.DoubleSide });
  // The main camera drives every water pass too, so reflections cannot pick a
  // different LOD. Offline model construction/export defaults to full detail.
  const uniforms = { meadowCamera: { value: new THREE.Vector3() }, meadowFocal: { value: 1e9 } };
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
uniform vec3 meadowCamera;
uniform float meadowFocal;`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
vec4 meadowRoot = vec4(0.0, 0.0, 0.0, 1.0);
float meadowSpread = 1.0;
#ifdef USE_INSTANCING
  meadowRoot = instanceMatrix * meadowRoot;
  meadowSpread = length(instanceMatrix[0].xyz);
#endif
meadowRoot = modelMatrix * meadowRoot;
float meadowPixels = ${MEADOW_BLADE_WIDTH} * meadowSpread * meadowFocal / max(0.001, distance(meadowRoot.xyz, meadowCamera));
float meadowLevel = smoothstep(${MEADOW_FADE_PIXELS[0]}, ${MEADOW_FADE_PIXELS[1]}, meadowPixels);
objectNormal.xz *= max(0.001, meadowLevel);`)
      .replace('#include <project_vertex>', `
// Sink continuously into the turf. No alpha noise, transparency sorting or
// hard per-clump switching; fully distant patches are culled on the CPU.
transformed.y = transformed.y * meadowLevel - 0.025 * (1.0 - meadowLevel);
#include <project_vertex>`);
  };
  material.customProgramCacheKey = () => 'meadow-screen-coverage-v13';
  return { material, uniforms };
}

export function updateMeadowVisibility(states, uniforms, camera, drawingHeight) {
  const focal = drawingHeight * camera.projectionMatrix.elements[5] / 2;
  camera.getWorldPosition(uniforms.meadowCamera.value);
  uniforms.meadowFocal.value = focal;
  const sphere = new THREE.Sphere();
  for (const { mesh } of states) {
    sphere.copy(mesh.boundingSphere).applyMatrix4(mesh.matrixWorld);
    const near = Math.max(.001, uniforms.meadowCamera.value.distanceTo(sphere.center) - sphere.radius);
    mesh.visible = meadowCoverage(near, focal, 1.3) > 0;
  }
}

export function meadowDetailTexture() {
  const size = 256, canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d'), data = ctx.createImageData(size, size);
  // Periodic, band-limited fibres (minimum wavelength 8 texels).
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size * Math.PI * 2, v = y / size * Math.PI * 2;
    const h = 128 + Math.sin(u * 21 + v * 8) * 9 + Math.sin(u * 13 - v * 17) * 6 + Math.cos(u * 8 + v * 5) * 5;
    data.data.set([h, h, h, 255], (y * size + x) * 4);
  }
  ctx.putImageData(data, 0, 0);
  const texture = new THREE.CanvasTexture(canvas); texture.name = 'meadow-local-fibres';
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(32, 32); texture.anisotropy = 8;
  return texture;
}
